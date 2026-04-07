import process from "node:process";

export type CloudDurabilityMode = "allow_memory_fallback" | "require_redis";
export type CloudDurabilityComponent =
  | "session_store"
  | "remote_access_store"
  | "usage_event_store"
  | "workflow_run_store"
  | "api_key_store";

function sanitizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasTruthyFlag(value: string | undefined): boolean {
  const normalized = sanitizeEnvValue(value)?.toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized !== "0" && normalized !== "false" && normalized !== "no";
}

export function resolveHostedRuntimeRole(env: NodeJS.ProcessEnv = process.env): string | null {
  return sanitizeEnvValue(env.HOSTED_RUNTIME_ROLE);
}

export function isCloudDurabilityStrictByDefault(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (resolveHostedRuntimeRole(env)) {
    return true;
  }

  if (sanitizeEnvValue(env.PORT)) {
    return true;
  }

  return (
    hasTruthyFlag(env.RENDER) ||
    sanitizeEnvValue(env.RENDER_SERVICE_ID) !== null ||
    hasTruthyFlag(env.VERCEL) ||
    sanitizeEnvValue(env.VERCEL_ENV) !== null ||
    sanitizeEnvValue(env.RAILWAY_ENVIRONMENT) !== null ||
    sanitizeEnvValue(env.FLY_APP_NAME) !== null
  );
}

export function getRedisUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const redisUrl = env.REDIS_URL?.trim();
  if (redisUrl) {
    return redisUrl;
  }

  const redisHost = env.REDIS_HOST?.trim();
  if (!redisHost) {
    return null;
  }

  const redisPort = env.REDIS_PORT?.trim() || "6379";
  return `redis://${redisHost}:${redisPort}`;
}

export function resolveCloudDurabilityMode(
  env: NodeJS.ProcessEnv = process.env
): CloudDurabilityMode {
  const configured = env.CLOUD_DURABILITY_MODE?.trim().toLowerCase();
  if (!configured) {
    return isCloudDurabilityStrictByDefault(env) ? "require_redis" : "allow_memory_fallback";
  }

  if (configured === "allow_memory_fallback" || configured === "permissive") {
    return "allow_memory_fallback";
  }

  if (configured === "require_redis" || configured === "strict") {
    return "require_redis";
  }

  throw new Error(
    `Unsupported CLOUD_DURABILITY_MODE "${configured}". Expected "allow_memory_fallback" or "require_redis".`
  );
}

export function assertCloudDurabilityRequirement(
  component: CloudDurabilityComponent,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (resolveCloudDurabilityMode(env) !== "require_redis") {
    return;
  }

  if (getRedisUrlFromEnv(env)) {
    return;
  }

  throw new Error(
    `CLOUD_DURABILITY_MODE=require_redis requires Redis configuration for ${component}.`
  );
}
