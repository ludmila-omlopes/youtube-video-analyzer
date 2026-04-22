import process from "node:process";

function readTrimmedEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isValidAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseScopes(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isLegacyAppRedirectPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/app";
}

function normalizeRedirectPath(value: string | undefined): string {
  const redirectPath = readTrimmedEnv(value) ?? "/oauth/callback";
  if (!redirectPath.startsWith("/")) {
    return "/oauth/callback";
  }

  if (isLegacyAppRedirectPath(redirectPath)) {
    return "/oauth/callback";
  }

  return redirectPath;
}

export type DisabledBrowserOAuthClientConfig = {
  enabled: false;
  reason: "not_configured" | "incomplete_config";
  authorizationUrl: null;
  tokenUrl: null;
  clientId: null;
  redirectPath: string;
  scopes: string[];
  audience: string | null;
  resource: string | null;
};

export type EnabledBrowserOAuthClientConfig = {
  enabled: true;
  reason: null;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectPath: string;
  scopes: string[];
  audience: string | null;
  resource: string | null;
};

export type BrowserOAuthClientConfig =
  | DisabledBrowserOAuthClientConfig
  | EnabledBrowserOAuthClientConfig;

export function getBrowserOAuthClientConfig(
  env: NodeJS.ProcessEnv = process.env
): BrowserOAuthClientConfig {
  const authorizationUrl = readTrimmedEnv(env.OAUTH_WEB_AUTHORIZATION_URL);
  const tokenUrl = readTrimmedEnv(env.OAUTH_WEB_TOKEN_URL);
  const clientId = readTrimmedEnv(env.OAUTH_WEB_CLIENT_ID);
  const redirectPath = normalizeRedirectPath(env.OAUTH_WEB_REDIRECT_PATH);
  const scopes = parseScopes(readTrimmedEnv(env.OAUTH_WEB_SCOPES) ?? readTrimmedEnv(env.OAUTH_REQUIRED_SCOPE));
  const apiAudience = readTrimmedEnv(env.OAUTH_AUDIENCE) ?? null;
  const audience = readTrimmedEnv(env.OAUTH_WEB_AUDIENCE) ?? apiAudience;
  const resource = readTrimmedEnv(env.OAUTH_WEB_RESOURCE) ?? apiAudience;

  const presentCount = [authorizationUrl, tokenUrl, clientId].filter(Boolean).length;
  if (presentCount === 0) {
    return {
      enabled: false,
      reason: "not_configured",
      authorizationUrl: null,
      tokenUrl: null,
      clientId: null,
      redirectPath,
      scopes,
      audience,
      resource,
    };
  }

  if (presentCount < 3 || !authorizationUrl || !tokenUrl || !clientId) {
    return {
      enabled: false,
      reason: "incomplete_config",
      authorizationUrl: null,
      tokenUrl: null,
      clientId: null,
      redirectPath,
      scopes,
      audience,
      resource,
    };
  }

  if (!isValidAbsoluteHttpUrl(authorizationUrl) || !isValidAbsoluteHttpUrl(tokenUrl)) {
    return {
      enabled: false,
      reason: "incomplete_config",
      authorizationUrl: null,
      tokenUrl: null,
      clientId: null,
      redirectPath,
      scopes,
      audience,
      resource,
    };
  }

  return {
    enabled: true,
    reason: null,
    authorizationUrl,
    tokenUrl,
    clientId,
    redirectPath,
    scopes,
    audience,
    resource,
  };
}
