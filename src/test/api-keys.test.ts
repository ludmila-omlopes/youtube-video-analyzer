import assert from "node:assert/strict";

import {
  createApiKeyStoreFromEnv,
  InMemoryApiKeyStore,
  type AuthPrincipal,
} from "../auth-billing/index.js";

const principal: AuthPrincipal = {
  subject: "user-1",
  issuer: "https://issuer.example.com/",
  audience: "youtube-video-analyzer-web",
  scope: ["mcp:access"],
  tokenId: null,
  rawClaims: {},
};

export async function run(): Promise<void> {
  const store = new InMemoryApiKeyStore();
  const created = await store.createApiKey(principal, "Studio key");

  assert.match(created.plaintextKey, /^ya_live_/);
  assert.equal(created.record.label, "Studio key");
  assert.equal(created.record.lastUsedAt, null);

  const listed = await store.listApiKeys("https://issuer.example.com/:user-1");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].keyId, created.record.keyId);

  const authenticated = await store.authenticateApiKey(created.plaintextKey);
  assert.ok(authenticated);
  assert.equal(authenticated?.record.keyId, created.record.keyId);
  assert.equal(authenticated?.principal.subject, principal.subject);
  assert.equal(authenticated?.principal.rawClaims.authMethod, "api_key");
  assert.ok(authenticated?.record.lastUsedAt);

  const revoked = await store.revokeApiKey("https://issuer.example.com/:user-1", created.record.keyId);
  assert.equal(revoked, true);

  const afterRevoke = await store.authenticateApiKey(created.plaintextKey);
  assert.equal(afterRevoke, null);

  assert.throws(
    () => createApiKeyStoreFromEnv({ CLOUD_DURABILITY_MODE: "require_redis" }),
    /requires Redis configuration for api_key_store/
  );
}
