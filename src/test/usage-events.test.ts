import assert from "node:assert/strict";

import { InMemoryUsageEventStore } from "../auth-billing/index.js";

export async function run(): Promise<void> {
  const store = new InMemoryUsageEventStore();

  const first = await store.append({
    accountId: "acct-1",
    kind: "analysis.short.completed",
    tool: "analyze_youtube_video",
    metadata: { youtubeUrl: "https://www.youtube.com/watch?v=test" },
  });
  const second = await store.append({
    accountId: "acct-1",
    kind: "credits.reserved",
    tool: "analyze_youtube_video",
    creditsDelta: -1,
    creditsBalance: 4,
    metadata: { reservationId: "reservation-1" },
  });
  const third = await store.append({
    accountId: "acct-1",
    kind: "credits.finalized",
    tool: "analyze_youtube_video",
    creditsDelta: 0,
    creditsBalance: 4,
    metadata: { reservationId: "reservation-1" },
  });

  assert.equal(typeof first.eventId, "string");
  assert.equal(typeof second.occurredAt, "string");
  assert.equal(typeof third.occurredAt, "string");

  const events = await store.listForAccount("acct-1");
  assert.deepEqual(
    events.map((event) => event.kind),
    ["credits.finalized", "credits.reserved", "analysis.short.completed"]
  );
  assert.equal(events[0]?.creditsDelta, 0);
  assert.equal(events[0]?.creditsBalance, 4);
  assert.equal(events[1]?.creditsDelta, -1);
  assert.equal(events[1]?.metadata?.reservationId, "reservation-1");
}
