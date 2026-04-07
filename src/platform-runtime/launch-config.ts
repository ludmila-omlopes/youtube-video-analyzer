import process from "node:process";

import { getBrowserOAuthClientConfig } from "../auth-billing/browser-oauth-client-config.js";
import { getOAuthConfig } from "../auth-billing/config.js";
import { getRedisUrlFromEnv, resolveCloudDurabilityMode, resolveHostedRuntimeRole } from "./durability-policy.js";

export type HostedRuntimeRole = "web" | "worker" | "admin";

function readTrimmedEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseHostedRuntimeRole(raw: string | null): HostedRuntimeRole | null {
  if (!raw) {
    return null;
  }

  switch (raw) {
    case "web":
    case "worker":
    case "admin":
      return raw;
    default:
      throw new Error(
        `Unsupported HOSTED_RUNTIME_ROLE "${raw}". Expected "web", "worker", or "admin".`
      );
  }
}

function requireEnv(name: string, value: string | undefined, message: string): string {
  const trimmed = readTrimmedEnv(value);
  if (!trimmed) {
    throw new Error(`${message} Missing ${name}.`);
  }

  return trimmed;
}

function assertRedisConfigured(role: HostedRuntimeRole, env: NodeJS.ProcessEnv): string {
  const redisUrl = getRedisUrlFromEnv(env);
  if (!redisUrl) {
    throw new Error(
      `Hosted ${role} runtime requires Redis configuration. Set REDIS_URL or REDIS_HOST / REDIS_PORT.`
    );
  }

  return redisUrl;
}

export function getHostedRuntimeRole(env: NodeJS.ProcessEnv = process.env): HostedRuntimeRole | null {
  return parseHostedRuntimeRole(resolveHostedRuntimeRole(env));
}

export function assertHostedRuntimeReady(
  env: NodeJS.ProcessEnv = process.env
): HostedRuntimeRole | null {
  const role = getHostedRuntimeRole(env);
  if (!role) {
    return null;
  }

  const durabilityMode = resolveCloudDurabilityMode(env);
  if (durabilityMode !== "require_redis") {
    throw new Error(
      `Hosted ${role} runtime must use strict durability. Set CLOUD_DURABILITY_MODE=require_redis or keep HOSTED_RUNTIME_ROLE=${role}.`
    );
  }

  switch (role) {
    case "web": {
      requireEnv(
        "GEMINI_API_KEY",
        env.GEMINI_API_KEY,
        "Hosted web runtime requires Gemini access for managed analysis."
      );
      requireEnv(
        "YOUTUBE_API_KEY",
        env.YOUTUBE_API_KEY,
        "Hosted web runtime requires YouTube metadata access."
      );
      assertRedisConfigured(role, env);

      if (readTrimmedEnv(env.ALLOW_UNAUTHENTICATED_HOSTED_DEV)?.toLowerCase() === "true") {
        throw new Error(
          "Hosted web runtime cannot start with ALLOW_UNAUTHENTICATED_HOSTED_DEV=true. Configure real OAuth for product launch."
        );
      }

      const oauthConfig = getOAuthConfig(env);
      if (!oauthConfig.enabled) {
        throw new Error(
          "Hosted web runtime requires OAUTH_ENABLED=true plus OAUTH_ISSUER, OAUTH_AUDIENCE, and OAUTH_JWKS_URL."
        );
      }

      const browserOAuthConfig = getBrowserOAuthClientConfig(env);
      if (!browserOAuthConfig.enabled) {
        throw new Error(
          "Hosted web runtime requires browser OAuth client settings: OAUTH_WEB_CLIENT_ID, OAUTH_WEB_AUTHORIZATION_URL, and OAUTH_WEB_TOKEN_URL."
        );
      }

      return role;
    }

    case "worker": {
      requireEnv(
        "GEMINI_API_KEY",
        env.GEMINI_API_KEY,
        "Hosted worker runtime requires Gemini access for queued long analysis."
      );
      assertRedisConfigured(role, env);
      return role;
    }

    case "admin": {
      assertRedisConfigured(role, env);
      requireEnv(
        "ADMIN_USERNAME",
        env.ADMIN_USERNAME,
        "Hosted admin runtime requires dashboard basic auth credentials."
      );
      requireEnv(
        "ADMIN_PASSWORD",
        env.ADMIN_PASSWORD,
        "Hosted admin runtime requires dashboard basic auth credentials."
      );
      return role;
    }
  }
}

export function getHostedRuntimeStartupSummary(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const role = getHostedRuntimeRole(env);
  if (!role) {
    return [];
  }

  const summary = [
    `Hosted runtime role: ${role}`,
    `Durability mode: ${resolveCloudDurabilityMode(env)}`,
    `Redis configured: ${getRedisUrlFromEnv(env) ? "yes" : "no"}`,
  ];

  if (role === "web") {
    summary.push(`OAuth enabled: ${getOAuthConfig(env).enabled ? "yes" : "no"}`);
    summary.push(`Browser OAuth ready: ${getBrowserOAuthClientConfig(env).enabled ? "yes" : "no"}`);
  }

  if (role === "admin") {
    summary.push(`Admin auth configured: ${readTrimmedEnv(env.ADMIN_USERNAME) ? "yes" : "no"}`);
  }

  return summary;
}
