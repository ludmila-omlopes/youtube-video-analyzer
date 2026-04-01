import assert from "node:assert/strict";

import {
  getDashboardAuthConfig,
  getDashboardQueueNames,
  getDashboardReadOnly,
  getDashboardRedisUrl,
  getDashboardServerConfig,
  isDashboardRequestAuthorized,
  parseBasicAuthHeader,
} from "../app/queue-dashboard.js";

export async function run(): Promise<void> {
  assert.deepEqual(getDashboardServerConfig({} as NodeJS.ProcessEnv), {
    host: "127.0.0.1",
    port: 3020,
  });
  assert.deepEqual(getDashboardServerConfig({ PORT: "10000" } as NodeJS.ProcessEnv), {
    host: "0.0.0.0",
    port: 10000,
  });

  assert.deepEqual(getDashboardQueueNames({} as NodeJS.ProcessEnv), ["long-youtube-analysis"]);
  assert.deepEqual(
    getDashboardQueueNames({ BULL_BOARD_QUEUE_NAMES: " queue-a,queue-b , , queue-c " } as NodeJS.ProcessEnv),
    ["queue-a", "queue-b", "queue-c"]
  );

  assert.equal(getDashboardReadOnly({} as NodeJS.ProcessEnv), true);
  assert.equal(getDashboardReadOnly({ BULL_BOARD_READ_ONLY: "false" } as NodeJS.ProcessEnv), false);

  assert.deepEqual(
    getDashboardAuthConfig({
      ADMIN_USERNAME: " admin ",
      ADMIN_PASSWORD: " secret ",
    } as NodeJS.ProcessEnv),
    {
      username: "admin",
      password: "secret",
    }
  );
  assert.throws(
    () => getDashboardAuthConfig({ ADMIN_PASSWORD: "secret" } as NodeJS.ProcessEnv),
    /Missing ADMIN_USERNAME/
  );
  assert.throws(
    () => getDashboardAuthConfig({ ADMIN_USERNAME: "admin" } as NodeJS.ProcessEnv),
    /Missing ADMIN_PASSWORD/
  );

  assert.equal(getDashboardRedisUrl({ REDIS_URL: "redis://example:6379" } as NodeJS.ProcessEnv), "redis://example:6379");
  assert.equal(
    getDashboardRedisUrl({ REDIS_HOST: "redis-host", REDIS_PORT: "6380" } as NodeJS.ProcessEnv),
    "redis://redis-host:6380"
  );

  const headerValue = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
  assert.deepEqual(parseBasicAuthHeader(headerValue), {
    username: "admin",
    password: "secret",
  });
  assert.equal(parseBasicAuthHeader(undefined), null);
  assert.equal(parseBasicAuthHeader("Bearer token"), null);

  assert.equal(
    isDashboardRequestAuthorized(headerValue, { username: "admin", password: "secret" }),
    true
  );
  assert.equal(
    isDashboardRequestAuthorized(headerValue, { username: "admin", password: "wrong" }),
    false
  );
}
