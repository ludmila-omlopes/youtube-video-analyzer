import assert from "node:assert/strict";

import { InMemoryAnalysisSessionStore } from "../app/session-store.js";
import { VideoAnalysisService } from "../app/video-analysis-service.js";
import { DiagnosticError } from "../lib/errors.js";
import { testLogger } from "./test-helpers.js";

export async function run(): Promise<void> {
  const sessionStore = new InMemoryAnalysisSessionStore();
  await sessionStore.set({
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
  });

  const ai = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          detectedLanguage: "en",
          summary: "follow-up",
          topics: [],
          keyMoments: [],
          notableQuotes: [],
          actionItems: [],
          safetyOrAccuracyNotes: [],
        }),
      }),
    },
  };

  const localService = new VideoAnalysisService({ ai: ai as never, sessionStore });
  const followUp = await localService.continueLong(
    { sessionId: "session-1", analysisPrompt: "Continue" },
    { logger: testLogger, tool: "continue_long_video_analysis" }
  );

  assert.equal(followUp.sessionId, "session-1");
  assert.deepEqual(followUp.analysis, {
    detectedLanguage: "en",
    summary: "follow-up",
    topics: [],
    keyMoments: [],
    notableQuotes: [],
    actionItems: [],
    safetyOrAccuracyNotes: [],
  });

  const previousYouTubeApiKey = process.env.YOUTUBE_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.YOUTUBE_API_KEY = "test-youtube-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        items: [
          {
            snippet: {
              title: "Video",
              channelId: "channel-1",
              channelTitle: "Channel",
              publishedAt: "2026-03-24T00:00:00Z",
              liveBroadcastContent: "none",
            },
            contentDetails: {
              duration: "PT2M",
              definition: "hd",
              caption: "true",
              licensedContent: false,
              projection: "rectangular",
              dimension: "2d",
            },
            status: {
              privacyStatus: "public",
              embeddable: true,
            },
            statistics: {
              viewCount: "1",
              likeCount: "2",
              favoriteCount: "0",
              commentCount: "3",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const metadata = await localService.getYouTubeMetadata(
      { youtubeUrl: "https://youtu.be/test" },
      { logger: testLogger, tool: "get_youtube_video_metadata" }
    );

    assert.equal(metadata.videoId, "test");
    assert.equal(metadata.normalizedYoutubeUrl, "https://www.youtube.com/watch?v=test");
  } finally {
    if (previousYouTubeApiKey === undefined) {
      delete process.env.YOUTUBE_API_KEY;
    } else {
      process.env.YOUTUBE_API_KEY = previousYouTubeApiKey;
    }

    globalThis.fetch = previousFetch;
  }

  const previousYtDlpPath = process.env.YT_DLP_PATH;
  process.env.YT_DLP_PATH = "definitely-missing-yt-dlp-command";

  try {
    const cloudService = new VideoAnalysisService({
      ai: ai as never,
      sessionStore: new InMemoryAnalysisSessionStore(),
      runtimeMode: "cloud",
    });

    await assert.rejects(
      () =>
        (cloudService as unknown as {
          assertCloudLongVideoRuntime: (
            input: { youtubeUrl: string; analysisPrompt: string; strategy?: "uploaded_file" | "auto" | "url_chunks" },
            context: { logger: typeof testLogger; tool: string }
          ) => Promise<void>;
        }).assertCloudLongVideoRuntime(
          {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
            analysisPrompt: "Analyze",
            strategy: "uploaded_file",
          },
          { logger: testLogger, tool: "analyze_long_youtube_video" }
        ),
      (error: unknown) => {
        assert.ok(error instanceof DiagnosticError);
        assert.equal(error.code, "LONG_VIDEO_RUNTIME_UNAVAILABLE");
        return true;
      }
    );

    await assert.doesNotReject(() =>
      (cloudService as unknown as {
        assertCloudLongVideoRuntime: (
          input: { youtubeUrl: string; analysisPrompt: string; strategy?: "uploaded_file" | "auto" | "url_chunks" },
          context: { logger: typeof testLogger; tool: string }
        ) => Promise<void>;
      }).assertCloudLongVideoRuntime(
        {
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          analysisPrompt: "Analyze",
          strategy: "auto",
        },
        { logger: testLogger, tool: "analyze_long_youtube_video" }
      )
    );

    await assert.doesNotReject(() =>
      (cloudService as unknown as {
        assertCloudLongVideoRuntime: (
          input: { youtubeUrl: string; analysisPrompt: string; strategy?: "uploaded_file" | "auto" | "url_chunks" },
          context: { logger: typeof testLogger; tool: string }
        ) => Promise<void>;
      }).assertCloudLongVideoRuntime(
        {
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          analysisPrompt: "Analyze",
          strategy: "url_chunks",
        },
        { logger: testLogger, tool: "analyze_long_youtube_video" }
      )
    );
  } finally {
    if (previousYtDlpPath === undefined) {
      delete process.env.YT_DLP_PATH;
    } else {
      process.env.YT_DLP_PATH = previousYtDlpPath;
    }
  }
}
