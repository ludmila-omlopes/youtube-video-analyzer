import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import process from "node:process";

import { getBrowserOAuthClientConfig, type EnabledBrowserOAuthClientConfig } from "../auth-billing/index.js";

import {
  HOSTED_OAUTH_PKCE_VERIFIER_COOKIE,
  HOSTED_OAUTH_STATE_COOKIE,
  parseCookieHeader,
  serializeAccessTokenCookie,
  serializeClearAccessTokenCookie,
  serializeClearPkceCookies,
  serializePkceCookies,
} from "./hosted-session-cookie.js";

function base64UrlEncode(data: Buffer): string {
  return data
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function createPkceVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

function createPkceChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier, "utf8").digest();
  return base64UrlEncode(digest);
}

function createOAuthState(): string {
  return base64UrlEncode(randomBytes(24));
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    return false;
  }

  return timingSafeEqual(ab, bb);
}

function getLoginSuccessPath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.OAUTH_LOGIN_SUCCESS_PATH?.trim();
  const path = raw && raw.startsWith("/") ? raw : "/dashboard";
  return path.split("?")[0] || "/dashboard";
}

function getLoginErrorQuery(errorCode: string): string {
  const params = new URLSearchParams({ oauth_error: errorCode });
  return `?${params.toString()}`;
}

function buildAuthorizeUrl(
  request: Request,
  config: EnabledBrowserOAuthClientConfig,
  codeChallenge: string,
  state: string
): URL {
  const redirectUrl = new URL(config.redirectPath, request.url).toString();
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUrl);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (config.scopes.length) {
    url.searchParams.set("scope", config.scopes.join(" "));
  }

  if (config.audience) {
    url.searchParams.set("audience", config.audience);
  }

  if (config.resource) {
    url.searchParams.set("resource", config.resource);
  }

  return url;
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function redirectResponse(location: string, setCookieHeaders: string[]): Response {
  const headers = new Headers();
  headers.set("location", location);
  headers.set("cache-control", "no-store");
  for (const cookie of setCookieHeaders) {
    headers.append("set-cookie", cookie);
  }

  return new Response(null, { status: 302, headers });
}

export async function handleHostedLoginStartRequest(request: Request): Promise<Response> {
  const config = getBrowserOAuthClientConfig();
  if (!config.enabled) {
    return createJsonResponse(
      {
        error: {
          code: "OAUTH_BROWSER_NOT_CONFIGURED",
          message:
            "Set OAUTH_WEB_CLIENT_ID, OAUTH_WEB_AUTHORIZATION_URL, and OAUTH_WEB_TOKEN_URL to enable hosted login.",
        },
      },
      503
    );
  }

  const verifier = createPkceVerifier();
  const state = createOAuthState();
  const challenge = createPkceChallenge(verifier);
  const authorizeUrl = buildAuthorizeUrl(request, config, challenge, state);

  return redirectResponse(authorizeUrl.toString(), serializePkceCookies(verifier, state, request));
}

type TokenSuccess = { access_token: string };
type TokenError = { error?: string; error_description?: string };

export async function handleHostedOAuthCallbackRequest(request: Request): Promise<Response> {
  const config = getBrowserOAuthClientConfig();
  if (!config.enabled) {
    return createJsonResponse(
      {
        error: {
          code: "OAUTH_BROWSER_NOT_CONFIGURED",
          message: "OAuth browser client is not configured.",
        },
      },
      503
    );
  }

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  const landing = getLoginSuccessPath();

  if (oauthError) {
    const desc = url.searchParams.get("error_description") || oauthError;
    const next = `${landing}${getLoginErrorQuery("authorize")}&oauth_error_detail=${encodeURIComponent(desc.slice(0, 200))}`;
    return redirectResponse(next, serializeClearPkceCookies(request));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const expectedState = cookies.get(HOSTED_OAUTH_STATE_COOKIE);
  const verifier = cookies.get(HOSTED_OAUTH_PKCE_VERIFIER_COOKIE);

  if (!code || !state || !expectedState || !verifier) {
    return redirectResponse(
      `${landing}${getLoginErrorQuery("missing_code_or_session")}`,
      serializeClearPkceCookies(request)
    );
  }

  if (!timingSafeEqualString(state, expectedState)) {
    return redirectResponse(
      `${landing}${getLoginErrorQuery("state_mismatch")}`,
      serializeClearPkceCookies(request)
    );
  }

  const redirectUri = new URL(config.redirectPath, request.url).toString();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  if (config.resource) {
    body.set("resource", config.resource);
  }

  const clientSecret = process.env.OAUTH_WEB_CLIENT_SECRET?.trim();
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    return redirectResponse(
      `${landing}${getLoginErrorQuery("token_unreachable")}`,
      serializeClearPkceCookies(request)
    );
  }

  const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as TokenSuccess & TokenError;
  const clearPkce = serializeClearPkceCookies(request);

  if (!tokenResponse.ok || typeof tokenPayload.access_token !== "string" || !tokenPayload.access_token.trim()) {
    const detail =
      typeof tokenPayload.error_description === "string"
        ? tokenPayload.error_description
        : typeof tokenPayload.error === "string"
          ? tokenPayload.error
          : "token_exchange_failed";

    return redirectResponse(
      `${landing}${getLoginErrorQuery("exchange_failed")}&oauth_error_detail=${encodeURIComponent(detail.slice(0, 200))}`,
      clearPkce
    );
  }

  return redirectResponse(`${landing}?signed_in=1`, [
    ...clearPkce,
    serializeAccessTokenCookie(tokenPayload.access_token.trim(), request),
  ]);
}

export async function handleHostedLogoutRequest(request: Request): Promise<Response> {
  const landing = getLoginSuccessPath();
  return redirectResponse(`${landing}?signed_out=1`, [
    serializeClearAccessTokenCookie(request),
    ...serializeClearPkceCookies(request),
  ]);
}

export async function handleLegacyAppRedirectRequest(): Promise<Response> {
  return new Response(null, {
    status: 302,
    headers: {
      location: "/dashboard",
      "cache-control": "no-store",
    },
  });
}

export function resolveOAuthCallbackPathname(env: NodeJS.ProcessEnv = process.env): string {
  return getBrowserOAuthClientConfig(env).redirectPath;
}

function normalizePathname(pathname: string): string {
  if (pathname === "" || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "") || "/";
}

export function oauthCallbackPathMatches(pathname: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return normalizePathname(pathname) === normalizePathname(getBrowserOAuthClientConfig(env).redirectPath);
}

/** @internal */
export const __test = {
  buildAuthorizeUrl,
  createPkceChallenge,
  timingSafeEqualString,
};
