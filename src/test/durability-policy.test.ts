import assert from "node:assert/strict";

import {
  createApiKeyStoreFromEnv,
  createRemoteAccessStoreFromEnv,
  createUsageEventStoreFromEnv,
} from "../auth-billing/index.js";
import {
  createCloudSessionStore,
  createWorkflowRunStoreFromEnv,
  isCloudDurabilityStrictByDefault,
  resolveCloudDurabilityMode,
  resolveHostedRuntimeRole,
} from "../platform-runtime/index.js";

export async function run(): Promise<void> {
  assert.equal(resolveHostedRuntimeRole({ HOSTED_RUNTIME_ROLE: "worker" }), "worker");
  assert.equal(resolveHostedRuntimeRole({}), null);

  assert.equal(isCloudDurabilityStrictByDefault({}), false);
  assert.equal(isCloudDurabilityStrictByDefault({ PORT: "10000" }), true);
  assert.equal(isCloudDurabilityStrictByDefault({ HOSTED_RUNTIME_ROLE: "worker" }), true);
  assert.equal(isCloudDurabilityStrictByDefault({ RENDER: "true" }), true);

  assert.equal(resolveCloudDurabilityMode({}), "allow_memory_fallback");
  assert.equal(resolveCloudDurabilityMode({ PORT: "10000" }), "require_redis");
  assert.equal(resolveCloudDurabilityMode({ HOSTED_RUNTIME_ROLE: "admin" }), "require_redis");
  assert.equal(
    resolveCloudDurabilityMode({ PORT: "10000", CLOUD_DURABILITY_MODE: "allow_memory_fallback" }),
    "allow_memory_fallback"
  );

  assert.throws(
    () => createRemoteAccessStoreFromEnv({ HOSTED_RUNTIME_ROLE: "worker" }),
    /requires Redis configuration for remote_access_store/
  );
  assert.throws(
    () => createUsageEventStoreFromEnv({ HOSTED_RUNTIME_ROLE: "worker" }),
    /requires Redis configuration for usage_event_store/
  );
  assert.throws(
    () => createApiKeyStoreFromEnv({ PORT: "10000" }),
    /requires Redis configuration for api_key_store/
  );
  assert.throws(
    () => createWorkflowRunStoreFromEnv({ PORT: "10000" }),
    /requires Redis configuration for workflow_run_store/
  );
  assert.throws(
    () => createCloudSessionStore({ PORT: "10000" }),
    /requires Redis configuration for session_store/
  );
}
