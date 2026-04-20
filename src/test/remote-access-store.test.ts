import assert from "node:assert/strict";

import {
  createRemoteAccessStoreFromEnv,
  getPrincipalKey,
  getRemoteAccountInitialCredits,
  InMemoryRemoteAccessStore,
  type AuthPrincipal,
} from "../auth-billing/index.js";

const principal: AuthPrincipal = {
  subject: "google-oauth2|user-1",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-video-analyzer.onrender.com/",
  scope: [],
  tokenId: "token-1",
  rawClaims: {},
};

export async function run(): Promise<void> {
  assert.throws(
    () => createRemoteAccessStoreFromEnv({ CLOUD_DURABILITY_MODE: "require_redis" }),
    /requires Redis configuration for remote_access_store/
  );

  const store = new InMemoryRemoteAccessStore();
  const accountId = getPrincipalKey(principal);
  const initialCredits = getRemoteAccountInitialCredits(process.env, "trial");

  const created = await store.upsertAccount(principal);
  assert.equal(created.accountId, accountId);

  const listed = await store.listAccounts({ limit: 10 });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.accountId, accountId);
  assert.equal(created.subject, principal.subject);
  assert.equal(created.issuer, principal.issuer);
  assert.equal(typeof created.createdAt, "string");
  assert.equal(typeof created.updatedAt, "string");
  assert.equal(typeof created.lastSeenAt, "string");
  assert.equal(created.plan, "trial");
  assert.equal(created.status, "active");
  assert.equal(created.creditBalance, initialCredits);

  const granted = await store.grantAccountCredits(accountId, 2);
  assert.equal(granted?.creditBalance, initialCredits + 2);

  const reserved = await store.reserveCredits(accountId, {
    reservationId: "reservation-1",
    credits: 3,
    tool: "analyze_youtube_video",
  });
  assert.ok(reserved);
  assert.equal(reserved?.changed, true);
  assert.equal(reserved?.reservation.state, "reserved");
  assert.equal(reserved?.account.creditBalance, initialCredits - 1);

  const loadedReservation = await store.getCreditReservation(accountId, "reservation-1");
  assert.equal(loadedReservation?.state, "reserved");

  const finalized = await store.finalizeCreditReservation(accountId, "reservation-1");
  assert.equal(finalized?.changed, true);
  assert.equal(finalized?.reservation.state, "finalized");
  assert.equal(finalized?.account.creditBalance, initialCredits - 1);

  const finalizedAgain = await store.finalizeCreditReservation(accountId, "reservation-1");
  assert.equal(finalizedAgain?.changed, false);
  assert.equal(finalizedAgain?.reservation.state, "finalized");

  const reservedForRelease = await store.reserveCredits(accountId, {
    reservationId: "reservation-2",
    credits: 2,
    tool: "start_long_youtube_video_analysis",
  });
  assert.equal(reservedForRelease?.account.creditBalance, initialCredits - 3);

  const released = await store.releaseCreditReservation(accountId, "reservation-2");
  assert.equal(released?.changed, true);
  assert.equal(released?.reservation.state, "released");
  assert.equal(released?.account.creditBalance, initialCredits - 1);

  const afterDebit = await store.adjustAccountCredits(accountId, -1);
  assert.equal(afterDebit?.creditBalance, initialCredits - 2);

  const broke = await store.adjustAccountCredits(accountId, -(initialCredits + 10));
  assert.equal(broke, null);
  assert.equal((await store.getAccount(accountId))?.creditBalance, initialCredits - 2);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const touched = await store.upsertAccount(principal);
  assert.equal(touched.createdAt, created.createdAt);
  assert.notEqual(touched.updatedAt, created.updatedAt);
  assert.notEqual(touched.lastSeenAt, created.lastSeenAt);

  await store.setJobOwner("job-1", accountId);
  assert.equal(await store.getJobOwner("job-1"), accountId);
  await store.deleteJobOwner?.("job-1");
  assert.equal(await store.getJobOwner("job-1"), null);

  await store.setJobCreditReservation("job-1", "reservation-1");
  assert.equal(await store.getJobCreditReservation("job-1"), "reservation-1");
  await store.deleteJobCreditReservation?.("job-1");
  assert.equal(await store.getJobCreditReservation("job-1"), null);

  await store.setSessionOwner("session-1", accountId);
  assert.equal(await store.getSessionOwner("session-1"), accountId);
  await store.deleteSessionOwner?.("session-1");
  assert.equal(await store.getSessionOwner("session-1"), null);
}
