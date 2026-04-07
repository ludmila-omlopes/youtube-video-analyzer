import process from "node:process";

function readTrimmedEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireAbsoluteUrl(name: string, value: string): string {
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  return value;
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
  const redirectPath = readTrimmedEnv(env.OAUTH_WEB_REDIRECT_PATH) ?? "/app";
  const scopes = parseScopes(readTrimmedEnv(env.OAUTH_WEB_SCOPES) ?? readTrimmedEnv(env.OAUTH_REQUIRED_SCOPE));
  const audience = readTrimmedEnv(env.OAUTH_WEB_AUDIENCE) ?? null;
  const resource = readTrimmedEnv(env.OAUTH_WEB_RESOURCE) ?? null;

  if (!redirectPath.startsWith("/")) {
    throw new Error("OAUTH_WEB_REDIRECT_PATH must start with '/'.");
  }

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

  return {
    enabled: true,
    reason: null,
    authorizationUrl: requireAbsoluteUrl("OAUTH_WEB_AUTHORIZATION_URL", authorizationUrl),
    tokenUrl: requireAbsoluteUrl("OAUTH_WEB_TOKEN_URL", tokenUrl),
    clientId,
    redirectPath,
    scopes,
    audience,
    resource,
  };
}
