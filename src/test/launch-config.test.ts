import assert from "node:assert/strict";

import {
  assertHostedRuntimeReady,
  getHostedRuntimeRole,
  getHostedRuntimeStartupSummary,
} from "../platform-runtime/index.js";

function createValidWebEnv(): NodeJS.ProcessEnv {
  return {
    HOSTED_RUNTIME_ROLE: "web",
    GEMINI_API_KEY: "gemini-test-key",
    YOUTUBE_API_KEY: "youtube-test-key",
    REDIS_URL: "redis://127.0.0.1:6379",
    OAUTH_ENABLED: "true",
    OAUTH_ISSUER: "https://issuer.example.com/",
    OAUTH_AUDIENCE: "https://youtube-analyzer.example.com/",
    OAUTH_JWKS_URL: "https://issuer.example.com/.well-known/jwks.json",
    OAUTH_REQUIRED_SCOPE: "mcp:access",
    OAUTH_WEB_CLIENT_ID: "client-123",
    OAUTH_WEB_AUTHORIZATION_URL: "https://issuer.example.com/authorize",
    OAUTH_WEB_TOKEN_URL: "https://issuer.example.com/oauth/token",
  };
}

export async function run(): Promise<void> {
  assert.equal(getHostedRuntimeRole({}), null);
  assert.equal(assertHostedRuntimeReady({}), null);
  assert.throws(
    () => getHostedRuntimeRole({ HOSTED_RUNTIME_ROLE: "jobs" }),
    /Unsupported HOSTED_RUNTIME_ROLE/
  );

  const validWebEnv = createValidWebEnv();
  assert.equal(getHostedRuntimeRole(validWebEnv), "web");
  assert.equal(assertHostedRuntimeReady(validWebEnv), "web");
  assert.deepEqual(getHostedRuntimeStartupSummary(validWebEnv), [
    "Hosted runtime role: web",
    "Durability mode: require_redis",
    "Redis configured: yes",
    "OAuth enabled: yes",
    "Browser OAuth ready: yes",
  ]);

  assert.throws(
    () => assertHostedRuntimeReady({ ...validWebEnv, ALLOW_UNAUTHENTICATED_HOSTED_DEV: "true" }),
    /cannot start with ALLOW_UNAUTHENTICATED_HOSTED_DEV=true/
  );
  assert.throws(
    () => assertHostedRuntimeReady({ ...validWebEnv, OAUTH_ENABLED: "false" }),
    /requires OAUTH_ENABLED=true/
  );
  assert.throws(
    () => assertHostedRuntimeReady({ ...validWebEnv, OAUTH_WEB_TOKEN_URL: undefined }),
    /requires browser OAuth client settings/
  );
  assert.throws(
    () => assertHostedRuntimeReady({
      ...validWebEnv,
      CLOUD_DURABILITY_MODE: "allow_memory_fallback",
    }),
    /must use strict durability/
  );

  const validWorkerEnv: NodeJS.ProcessEnv = {
    HOSTED_RUNTIME_ROLE: "worker",
    GEMINI_API_KEY: "gemini-test-key",
    REDIS_URL: "redis://127.0.0.1:6379",
  };
  assert.equal(assertHostedRuntimeReady(validWorkerEnv), "worker");
  assert.throws(
    () => assertHostedRuntimeReady({ HOSTED_RUNTIME_ROLE: "worker", GEMINI_API_KEY: "gemini-test-key" }),
    /requires Redis configuration/
  );

  const validAdminEnv: NodeJS.ProcessEnv = {
    HOSTED_RUNTIME_ROLE: "admin",
    REDIS_URL: "redis://127.0.0.1:6379",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "secret",
  };
  assert.equal(assertHostedRuntimeReady(validAdminEnv), "admin");
  assert.deepEqual(getHostedRuntimeStartupSummary(validAdminEnv), [
    "Hosted runtime role: admin",
    "Durability mode: require_redis",
    "Redis configured: yes",
    "Admin auth configured: yes",
  ]);
  assert.throws(
    () => assertHostedRuntimeReady({
      HOSTED_RUNTIME_ROLE: "admin",
      REDIS_URL: "redis://127.0.0.1:6379",
      ADMIN_USERNAME: "admin",
    }),
    /Missing ADMIN_PASSWORD/
  );
}
