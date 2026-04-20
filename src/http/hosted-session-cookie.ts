import process from "node:process";

export const HOSTED_OAUTH_PKCE_VERIFIER_COOKIE = "ya_oauth_v";
export const HOSTED_OAUTH_STATE_COOKIE = "ya_oauth_st";

const DEFAULT_ACCESS_COOKIE = "ya_session";

export function getHostedAccessTokenCookieName(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.OAUTH_HOSTED_ACCESS_COOKIE?.trim();
  return raw || DEFAULT_ACCESS_COOKIE;
}

export function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header?.trim()) {
    return map;
  }

  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) {
      continue;
    }

    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) {
      try {
        map.set(name, decodeURIComponent(value));
      } catch {
        map.set(name, value);
      }
    }
  }

  return map;
}

export function requestUsesHttps(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") {
    return true;
  }

  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwarded === "https";
}

export function shouldUseSecureCookies(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OAUTH_HOSTED_COOKIE_SECURE?.trim().toLowerCase() === "true") {
    return true;
  }

  if (env.OAUTH_HOSTED_COOKIE_SECURE?.trim().toLowerCase() === "false") {
    return false;
  }

  return requestUsesHttps(request);
}

function appendCookieFlags(base: string, request: Request, env: NodeJS.ProcessEnv): string {
  let out = `${base}; Path=/; HttpOnly; SameSite=Lax`;
  if (shouldUseSecureCookies(request, env)) {
    out += "; Secure";
  }

  return out;
}

export function serializePkceCookies(
  verifier: string,
  state: string,
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const maxAge = 600;
  const v = appendCookieFlags(
    `${HOSTED_OAUTH_PKCE_VERIFIER_COOKIE}=${encodeURIComponent(verifier)}; Max-Age=${maxAge}`,
    request,
    env
  );
  const s = appendCookieFlags(
    `${HOSTED_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Max-Age=${maxAge}`,
    request,
    env
  );
  return [v, s];
}

export function serializeClearPkceCookies(request: Request, env: NodeJS.ProcessEnv = process.env): string[] {
  const v = appendCookieFlags(`${HOSTED_OAUTH_PKCE_VERIFIER_COOKIE}=; Max-Age=0`, request, env);
  const s = appendCookieFlags(`${HOSTED_OAUTH_STATE_COOKIE}=; Max-Age=0`, request, env);
  return [v, s];
}

export function serializeAccessTokenCookie(
  token: string,
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): string {
  const name = getHostedAccessTokenCookieName(env);
  const maxAgeRaw = env.OAUTH_HOSTED_SESSION_MAX_AGE_SECONDS?.trim();
  const maxAge = maxAgeRaw ? Number(maxAgeRaw) : 28800;
  const safeMaxAge = Number.isFinite(maxAge) && maxAge > 0 ? Math.min(Math.floor(maxAge), 604800) : 28800;
  return appendCookieFlags(
    `${name}=${encodeURIComponent(token)}; Max-Age=${safeMaxAge}`,
    request,
    env
  );
}

export function serializeClearAccessTokenCookie(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const name = getHostedAccessTokenCookieName(env);
  return appendCookieFlags(`${name}=; Max-Age=0`, request, env);
}
