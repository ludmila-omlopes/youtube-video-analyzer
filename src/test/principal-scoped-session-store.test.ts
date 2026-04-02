import assert from "node:assert/strict";

import { createPrincipalScopedSessionStore } from "../app/principal-scoped-session-store.js";
import { InMemoryRemoteAccessStore } from "../app/remote-access-store.js";
import { InMemoryAnalysisSessionStore } from "../app/session-store.js";
import { getPrincipalKey, type AuthPrincipal } from "../lib/auth/principal.js";
import type { AnalysisSession } from "../lib/types.js";

const principalA: AuthPrincipal = {
  subject: "google-oauth2|user-a",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer-mcp.onrender.com/api/mcp",
  scope: [],
  tokenId: "token-a",
  rawClaims: {},
};

const principalB: AuthPrincipal = {
  subject: "google-oauth2|user-b",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer-mcp.onrender.com/api/mcp",
  scope: [],
  tokenId: "token-b",
  rawClaims: {},
};

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
  const baseStore = new InMemoryAnalysisSessionStore();
  const remoteAccessStore = new InMemoryRemoteAccessStore();
  const userAStore = createPrincipalScopedSessionStore(baseStore, principalA, remoteAccessStore);
  const userBStore = createPrincipalScopedSessionStore(baseStore, principalB, remoteAccessStore);

  await userAStore.set(session);

  const stored = await baseStore.get(session.sessionId);
  assert.equal(stored?.ownerId, getPrincipalKey(principalA));
  assert.equal(await remoteAccessStore.getSessionOwner(session.sessionId), getPrincipalKey(principalA));

  const ownSession = await userAStore.get(session.sessionId);
  assert.equal(ownSession?.sessionId, session.sessionId);
  assert.equal(ownSession?.ownerId, getPrincipalKey(principalA));

  assert.equal(await userBStore.get(session.sessionId), null);

  await userBStore.delete?.(session.sessionId);
  assert.equal((await baseStore.get(session.sessionId))?.sessionId, session.sessionId);

  await userAStore.delete?.(session.sessionId);
  assert.equal(await baseStore.get(session.sessionId), null);
  assert.equal(await remoteAccessStore.getSessionOwner(session.sessionId), null);
}
