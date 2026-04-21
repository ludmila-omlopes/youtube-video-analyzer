import process from "node:process";

import {
  resolveCloudSessionStoreDriver,
  type CloudSessionStoreDriver,
} from "./cloud-session-store.js";
import { getRedisUrlFromEnv } from "./durability-policy.js";

export type RedisBackedStoreDriver = "memory" | "redis";

export type WebPersistenceStatus = {
  remoteAccessStore: RedisBackedStoreDriver;
  usageEventStore: RedisBackedStoreDriver;
  workflowRunStore: RedisBackedStoreDriver;
  apiKeyStore: RedisBackedStoreDriver;
  sessionStore: CloudSessionStoreDriver;
  durable: boolean;
  warning: string | null;
};

export function resolveRedisBackedStoreDriver(
  env: NodeJS.ProcessEnv = process.env
): RedisBackedStoreDriver {
  return getRedisUrlFromEnv(env) ? "redis" : "memory";
}

export function getWebPersistenceStatus(
  env: NodeJS.ProcessEnv = process.env
): WebPersistenceStatus {
  const sharedStoreDriver = resolveRedisBackedStoreDriver(env);
  const sessionStore = resolveCloudSessionStoreDriver(env);

  let warning: string | null = null;
  if (sharedStoreDriver === "memory") {
    warning =
      "This environment is using in-memory account storage. Credits, onboarding, usage history, and recent runs reset when the process restarts unless REDIS_URL is configured.";
  } else if (sessionStore === "memory") {
    warning =
      "This environment keeps account state in Redis, but analysis sessions still use in-memory storage and may reset after a restart.";
  }

  return {
    remoteAccessStore: sharedStoreDriver,
    usageEventStore: sharedStoreDriver,
    workflowRunStore: sharedStoreDriver,
    apiKeyStore: sharedStoreDriver,
    sessionStore,
    durable: sharedStoreDriver === "redis" && sessionStore === "redis",
    warning,
  };
}
