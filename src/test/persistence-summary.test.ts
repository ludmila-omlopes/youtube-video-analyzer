import assert from "node:assert/strict";

import { getWebPersistenceStatus, resolveRedisBackedStoreDriver } from "../platform-runtime/index.js";

export async function run(): Promise<void> {
  assert.equal(resolveRedisBackedStoreDriver({}), "memory");
  assert.equal(resolveRedisBackedStoreDriver({ REDIS_URL: "redis://example.test:6379" }), "redis");

  const memory = getWebPersistenceStatus({});
  assert.equal(memory.remoteAccessStore, "memory");
  assert.equal(memory.workflowRunStore, "memory");
  assert.equal(memory.sessionStore, "memory");
  assert.equal(memory.durable, false);
  assert.match(memory.warning ?? "", /in-memory account storage/i);

  const redis = getWebPersistenceStatus({
    REDIS_URL: "redis://example.test:6379",
    SESSION_STORE_DRIVER: "redis",
  });
  assert.equal(redis.remoteAccessStore, "redis");
  assert.equal(redis.usageEventStore, "redis");
  assert.equal(redis.workflowRunStore, "redis");
  assert.equal(redis.sessionStore, "redis");
  assert.equal(redis.durable, true);
  assert.equal(redis.warning, null);

  const mixed = getWebPersistenceStatus({
    REDIS_URL: "redis://example.test:6379",
    SESSION_STORE_DRIVER: "memory",
  });
  assert.equal(mixed.remoteAccessStore, "redis");
  assert.equal(mixed.sessionStore, "memory");
  assert.equal(mixed.durable, false);
  assert.match(mixed.warning ?? "", /analysis sessions still use in-memory storage/i);
}
