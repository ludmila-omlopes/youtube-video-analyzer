import assert from "node:assert/strict";

import {
  createPrincipalScopedService,
  getPrincipalKey,
  InMemoryRemoteAccessStore,
  InMemoryUsageEventStore,
  type AuthPrincipal,
} from "../auth-billing/index.js";
import type { AnalysisExecutionContext } from "../youtube-core/index.js";
import { DiagnosticError } from "../lib/errors.js";

import { testLogger } from "./test-helpers.js";

const principal: AuthPrincipal = {
  subject: "auth0|scoped-1",
  issuer: "https://issuer.example.com/",
  audience: "https://app.example.com/mcp",
  scope: [],
  tokenId: "tok",
  rawClaims: {},
};

function shortContext(): AnalysisExecutionContext {
  return {
    logger: testLogger,
    tool: "analyze_youtube_video",
    abortSignal: new AbortController().signal,
  };
}

function audioContext(): AnalysisExecutionContext {
  return {
    logger: testLogger,
    tool: "analyze_youtube_video_audio",
    abortSignal: new AbortController().signal,
  };
}

export async function run(): Promise<void> {
  const prevCredits = process.env.REMOTE_ACCOUNT_INITIAL_CREDITS;
  process.env.REMOTE_ACCOUNT_INITIAL_CREDITS = "2";

  try {
    const store = new InMemoryRemoteAccessStore();
    const usageEvents = new InMemoryUsageEventStore();
    await store.upsertAccount(principal);

    const inner = {
      async analyzeShort() {
        return {
          model: "gemini-test",
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          clip: { startOffsetSeconds: null, endOffsetSeconds: null },
          usedCustomSchema: false,
          analysis: { summary: "ok" },
        };
      },
      async analyzeAudio() {
        return {
          model: "gemini-test",
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          clip: { startOffsetSeconds: null, endOffsetSeconds: null },
          usedCustomSchema: false,
          analysis: {
            detectedLanguage: "en",
            summary: "audio",
            topics: [],
            transcriptSegments: [],
            notableQuotes: [],
            actionItems: [],
            safetyOrAccuracyNotes: [],
          },
        };
      },
      async analyzeLong() {
        throw new Error("not used");
      },
      async continueLong() {
        throw new Error("not used");
      },
      async getYouTubeMetadata() {
        throw new Error("not used");
      },
    };

    const wrapped = createPrincipalScopedService(inner, principal, store, usageEvents);

    const accountId = getPrincipalKey(principal);

    await wrapped.analyzeShort({ youtubeUrl: "https://www.youtube.com/watch?v=test" }, shortContext());
    assert.equal((await store.getAccount(accountId))?.creditBalance, 1);
    assert.deepEqual(
      (await usageEvents.listForAccount(accountId)).map((event) => event.kind),
      ["credits.finalized", "analysis.short.completed", "credits.reserved"]
    );

    await wrapped.analyzeAudio({ youtubeUrl: "https://www.youtube.com/watch?v=test" }, audioContext());
    assert.equal((await store.getAccount(accountId))?.creditBalance, 0);
    assert.deepEqual(
      (await usageEvents.listForAccount(accountId)).map((event) => event.kind),
      [
        "credits.finalized",
        "analysis.audio.completed",
        "credits.reserved",
        "credits.finalized",
        "analysis.short.completed",
        "credits.reserved",
      ]
    );

    await assert.rejects(
      () => wrapped.analyzeShort({ youtubeUrl: "https://www.youtube.com/watch?v=test" }, shortContext()),
      (error: unknown) => {
        assert.ok(error instanceof DiagnosticError);
        assert.equal(error.code, "INSUFFICIENT_CREDITS");
        return true;
      }
    );

    const failingStore = new InMemoryRemoteAccessStore();
    const failingUsageEvents = new InMemoryUsageEventStore();
    await failingStore.upsertAccount(principal);
    const failingWrapped = createPrincipalScopedService(
      {
        async analyzeShort() {
          throw new Error("provider exploded");
        },
        async analyzeAudio() {
          throw new Error("not used");
        },
        async analyzeLong() {
          throw new Error("not used");
        },
        async continueLong() {
          throw new Error("not used");
        },
        async getYouTubeMetadata() {
          throw new Error("not used");
        },
      },
      principal,
      failingStore,
      failingUsageEvents
    );

    await assert.rejects(
      () => failingWrapped.analyzeShort({ youtubeUrl: "https://www.youtube.com/watch?v=test" }, shortContext()),
      /provider exploded/
    );
    assert.equal((await failingStore.getAccount(accountId))?.creditBalance, 2);
    assert.deepEqual(
      (await failingUsageEvents.listForAccount(accountId)).map((event) => event.kind),
      ["credits.released", "credits.reserved"]
    );
  } finally {
    if (prevCredits === undefined) {
      delete process.env.REMOTE_ACCOUNT_INITIAL_CREDITS;
    } else {
      process.env.REMOTE_ACCOUNT_INITIAL_CREDITS = prevCredits;
    }
  }
}
