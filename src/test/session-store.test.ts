import assert from "node:assert/strict";

import { InMemoryAnalysisSessionStore } from "../app/session-store.js";
import type { AnalysisSession } from "../lib/types.js";

const session: AnalysisSession = {
  sessionId: "session-1",
  normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
  uploadedFile: {
    fileName: "files/test",
    fileUri: "https://example.com/test.mp4",
    mimeType: "video/mp4",
  },
  cacheName: "cache/test",
  cacheModel: "gemini-2.5-pro",
  createdAt: "2026-03-25T00:00:00.000Z",
  durationSeconds: 120,
  title: "Test",
};

export async function run(): Promise<void> {
  const store = new InMemoryAnalysisSessionStore();

  assert.equal(await store.get(session.sessionId), null);

  await store.set(session);
  assert.deepEqual(await store.get(session.sessionId), session);

  await store.delete?.(session.sessionId);
  assert.equal(await store.get(session.sessionId), null);
}
