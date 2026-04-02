import assert from "node:assert/strict";

import { InMemoryRemoteAccessStore } from "../app/remote-access-store.js";
import { getPrincipalKey, type AuthPrincipal } from "../lib/auth/principal.js";

const principal: AuthPrincipal = {
  subject: "google-oauth2|user-1",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer-mcp.onrender.com/api/mcp",
  scope: [],
  tokenId: "token-1",
  rawClaims: {},
};

export async function run(): Promise<void> {
  const store = new InMemoryRemoteAccessStore();
  const accountId = getPrincipalKey(principal);

  const created = await store.upsertAccount(principal);
  assert.equal(created.accountId, accountId);
  assert.equal(created.subject, principal.subject);
  assert.equal(created.issuer, principal.issuer);
  assert.equal(typeof created.createdAt, "string");
  assert.equal(typeof created.updatedAt, "string");

  const loaded = await store.getAccount(accountId);
  assert.equal(loaded?.accountId, accountId);

  await store.setJobOwner("job-1", accountId);
  assert.equal(await store.getJobOwner("job-1"), accountId);
  await store.deleteJobOwner?.("job-1");
  assert.equal(await store.getJobOwner("job-1"), null);

  await store.setSessionOwner("session-1", accountId);
  assert.equal(await store.getSessionOwner("session-1"), accountId);
  await store.deleteSessionOwner?.("session-1");
  assert.equal(await store.getSessionOwner("session-1"), null);
}
