import {
  AccessTokenValidationError,
  getHostedAccessPolicy,
  getBrowserOAuthClientConfig,
  getOAuthProtectedResourceMetadataUrl,
  type HostedAccessPolicy,
  type BrowserOAuthClientConfig,
  type AuthPrincipal,
  type OAuthConfig,
  type ValidateAccessTokenOptions,
  validateAccessToken,
} from "../auth-billing/index.js";

import { getHostedAccessTokenCookieName, parseCookieHeader } from "./hosted-session-cookie.js";

export const LOCAL_WEB_APP_PRINCIPAL: AuthPrincipal = {
  subject: "local-browser-user",
  issuer: "local://youtube-video-analyzer-web",
  audience: "youtube-video-analyzer-web",
  scope: ["web:local"],
  tokenId: null,
  rawClaims: {
    mode: "local",
  },
};

export type AuthenticatedWebRequest =
  | {
      ok: true;
      principal: AuthPrincipal;
      authMode: "oauth" | "local";
      config: OAuthConfig;
    }
  | {
      ok: false;
      response: Response;
      config: OAuthConfig;
    };

export type AuthenticateWebRequestOptions = {
  config?: OAuthConfig;
  policy?: HostedAccessPolicy;
  validateBearerToken?: (
    authorizationHeader: string | null,
    config: Extract<OAuthConfig, { enabled: true }>,
    options?: ValidateAccessTokenOptions
  ) => Promise<AuthPrincipal>;
};

export type BrowserSigninPayload = {
  enabled: boolean;
  reason: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  clientId: string | null;
  redirectUrl: string;
  scopes: string[];
  audience: string | null;
  resource: string | null;
};

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function createWebAuthFailureResponse(
  request: Request,
  config: Extract<OAuthConfig, { enabled: true }>,
  error: AccessTokenValidationError,
  browserSignin: BrowserSigninPayload
): Response {
  return createJsonResponse(
    {
      error: {
        code: error.code,
        message: error.message,
      },
      auth: {
        required: true,
        mode: "oauth",
        resourceName: config.resourceName,
        issuer: config.issuer,
        audience: config.audience,
        requiredScope: config.requiredScope,
        protectedResourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(request),
        browserSignin,
      },
    },
    401
  );
}

function createWebAuthConfigurationErrorResponse(
  request: Request,
  resourceName: string,
  message: string,
  browserSignin: BrowserSigninPayload
): Response {
  return createJsonResponse(
    {
      error: {
        code: "HOSTED_AUTH_CONFIGURATION_INVALID",
        message,
      },
      auth: {
        required: true,
        configured: false,
        mode: "oauth",
        resourceName,
        protectedResourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(request),
        browserSignin,
      },
    },
    503
  );
}

export function resolveAuthorizationHeaderFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (header) {
    return header;
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies.get(getHostedAccessTokenCookieName())?.trim();
  if (token) {
    return `Bearer ${token}`;
  }

  return null;
}

export function resolveBrowserSigninPayload(
  request: Request,
  config: BrowserOAuthClientConfig = getBrowserOAuthClientConfig()
): BrowserSigninPayload {
  const redirectUrl = new URL(config.redirectPath, request.url).toString();

  return {
    enabled: config.enabled,
    reason: config.reason,
    authorizationUrl: config.authorizationUrl,
    tokenUrl: config.tokenUrl,
    clientId: config.clientId,
    redirectUrl,
    scopes: config.scopes,
    audience: config.audience,
    resource: config.resource,
  };
}

export async function authenticateWebRequest(
  request: Request,
  options: AuthenticateWebRequestOptions = {}
): Promise<AuthenticatedWebRequest> {
  const browserSignin = resolveBrowserSigninPayload(request);
  const policy = options.policy ?? getHostedAccessPolicy({ oauthConfig: options.config });

  if (policy.allowUnauthenticatedHostedAccess) {
    return {
      ok: true,
      principal: LOCAL_WEB_APP_PRINCIPAL,
      authMode: "local",
      config: policy.oauthConfig,
    };
  }

  if (!policy.hostedAuthConfigured || !policy.oauthConfig.enabled) {
    return {
      ok: false,
      response: createWebAuthConfigurationErrorResponse(
        request,
        policy.oauthConfig.resourceName,
        policy.configurationError ?? "Hosted auth configuration is invalid.",
        browserSignin
      ),
      config: policy.oauthConfig,
    };
  }

  const config = policy.oauthConfig;

  try {
    const principal = await (options.validateBearerToken ?? validateAccessToken)(
      resolveAuthorizationHeaderFromRequest(request),
      config
    );
    return {
      ok: true,
      principal,
      authMode: "oauth",
      config,
    };
  } catch (error) {
    if (error instanceof AccessTokenValidationError) {
      return {
        ok: false,
        response: createWebAuthFailureResponse(request, config, error, browserSignin),
        config,
      };
    }

    throw error;
  }
}
