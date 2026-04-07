import process from "node:process";

function readTrimmedEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function parseClockToleranceSeconds(value: string | undefined): number {
  const trimmed = readTrimmedEnv(value);
  if (!trimmed) {
    return 5;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid OAUTH_CLOCK_TOLERANCE_SECONDS value "${trimmed}".`);
  }

  return parsed;
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = readTrimmedEnv(value);
  if (!trimmed) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return trimmed;
}

function requireUrlEnv(name: string, value: string | undefined): string {
  const trimmed = requireEnv(name, value);
  try {
    new URL(trimmed);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  return trimmed;
}

type BaseOAuthConfig = {
  resourceName: string;
  clockToleranceSeconds: number;
};

export type DisabledOAuthConfig = BaseOAuthConfig & {
  enabled: false;
  issuer: null;
  audience: null;
  jwksUrl: null;
  requiredScope: null;
};

export type EnabledOAuthConfig = BaseOAuthConfig & {
  enabled: true;
  issuer: string;
  audience: string;
  jwksUrl: string;
  requiredScope: string | null;
};

export type OAuthConfig = DisabledOAuthConfig | EnabledOAuthConfig;

export function createDisabledOAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): DisabledOAuthConfig {
  const resourceName = readTrimmedEnv(env.OAUTH_RESOURCE_NAME) ?? "youtube-video-analyzer-mcp";
  const clockToleranceSeconds = parseClockToleranceSeconds(env.OAUTH_CLOCK_TOLERANCE_SECONDS);

  return {
    enabled: false,
    issuer: null,
    audience: null,
    jwksUrl: null,
    requiredScope: null,
    resourceName,
    clockToleranceSeconds,
  };
}

export function getOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const enabled = parseEnabled(env.OAUTH_ENABLED);

  if (!enabled) {
    return createDisabledOAuthConfig(env);
  }

  const resourceName = readTrimmedEnv(env.OAUTH_RESOURCE_NAME) ?? "youtube-video-analyzer-mcp";
  const clockToleranceSeconds = parseClockToleranceSeconds(env.OAUTH_CLOCK_TOLERANCE_SECONDS);

  return {
    enabled: true,
    issuer: requireUrlEnv("OAUTH_ISSUER", env.OAUTH_ISSUER),
    audience: requireEnv("OAUTH_AUDIENCE", env.OAUTH_AUDIENCE),
    jwksUrl: requireUrlEnv("OAUTH_JWKS_URL", env.OAUTH_JWKS_URL),
    requiredScope: readTrimmedEnv(env.OAUTH_REQUIRED_SCOPE) ?? null,
    resourceName,
    clockToleranceSeconds,
  };
}
