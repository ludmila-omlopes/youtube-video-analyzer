import assert from "node:assert/strict";

import {
  getPrincipalKey,
  getRemoteAccountInitialCredits,
  InMemoryApiKeyStore,
  InMemoryRemoteAccessStore,
  InMemoryUsageEventStore,
  type AuthPrincipal,
  type OAuthConfig,
} from "../auth-billing/index.js";
import type { LongAnalysisJobs } from "../platform-runtime/index.js";
import {
  createApiAudioAnalysisHandler,
  createApiLongJobStartHandler,
  createApiLongJobStatusHandler,
  createApiMetadataHandler,
  createApiShortAnalysisHandler,
} from "../http/api.js";
import type {
  AnalysisExecutionContext,
  AudioToolInput,
  AudioToolOutput,
  FollowUpToolInput,
  FollowUpToolOutput,
  LongToolInput,
  LongToolOutput,
  MetadataToolInput,
  MetadataToolOutput,
  ShortToolInput,
  ShortToolOutput,
  VideoAnalysisServiceLike,
} from "@ludylops/video-analysis-core";

const principal: AuthPrincipal = {
  subject: "api-user-1",
  issuer: "local://api-tests",
  audience: "youtube-video-analyzer-web",
  scope: ["web:local"],
  tokenId: null,
  rawClaims: {},
};

const localConfig: OAuthConfig = {
  enabled: false,
  issuer: null,
  audience: null,
  jwksUrl: null,
  requiredScope: null,
  resourceName: "youtube-video-analyzer",
  clockToleranceSeconds: 5,
};

class FakeApiService implements VideoAnalysisServiceLike {
  async analyzeShort(
    input: ShortToolInput,
    context?: AnalysisExecutionContext
  ): Promise<ShortToolOutput> {
    await context?.reportProgress?.({
      progress: 3,
      total: 5,
      message: "Asking Gemini to analyze the video.",
    });
    await context?.reportProgress?.({
      progress: 4,
      total: 5,
      message: "Checking Gemini's response.",
    });

    return {
      model: "gemini-test",
      youtubeUrl: input.youtubeUrl,
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
      clip: {
        startOffsetSeconds: input.startOffsetSeconds ?? null,
        endOffsetSeconds: input.endOffsetSeconds ?? null,
      },
      usedCustomSchema: false,
      analysis: {
        summary: "short-analysis",
      },
    };
  }

  async analyzeAudio(input: AudioToolInput): Promise<AudioToolOutput> {
    return {
      model: input.model ?? "gemini-audio-test",
      youtubeUrl: input.youtubeUrl,
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
      clip: {
        startOffsetSeconds: input.startOffsetSeconds ?? null,
        endOffsetSeconds: input.endOffsetSeconds ?? null,
      },
      usedCustomSchema: false,
      analysis: {
        detectedLanguage: "en",
        summary: "audio-analysis",
        topics: ["topic"],
        transcriptSegments: [
          {
            timestamp: "00:10",
            transcript: "Audio segment.",
            translation: "",
          },
        ],
        notableQuotes: ["Audio segment."],
        actionItems: [],
        safetyOrAccuracyNotes: [],
      },
    };
  }

  async analyzeLong(_input: LongToolInput): Promise<LongToolOutput> {
    throw new Error("Long analysis is not used in this API test.");
  }

  async continueLong(_input: FollowUpToolInput): Promise<FollowUpToolOutput> {
    throw new Error("Follow-up analysis is not used in this API test.");
  }

  async getYouTubeMetadata(input: MetadataToolInput): Promise<MetadataToolOutput> {
    return {
      youtubeUrl: input.youtubeUrl,
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
      videoId: "test",
      title: "API test video",
      description: null,
      channelId: "channel-1",
      channelTitle: "API Test Channel",
      publishedAt: null,
      durationIso8601: "PT12M",
      durationSeconds: 720,
      definition: "hd",
      caption: true,
      licensedContent: false,
      projection: "rectangular",
      dimension: "2d",
      privacyStatus: "public",
      embeddable: true,
      liveBroadcastContent: "none",
      liveStreamingDetails: null,
      thumbnails: {},
      tags: ["api"],
      categoryId: "22",
      defaultLanguage: "en",
      defaultAudioLanguage: "en",
      statistics: {
        viewCount: 1200,
        likeCount: 30,
        favoriteCount: 0,
        commentCount: 4,
      },
    };
  }
}

function createLocalAuth() {
  return async () => ({
    ok: true as const,
    principal,
    authMode: "local" as const,
    config: localConfig,
  });
}

export async function run(): Promise<void> {
  const initialCredits = getRemoteAccountInitialCredits(process.env, "trial");
  const accountId = getPrincipalKey(principal);

  {
    const remoteAccessStore = new InMemoryRemoteAccessStore();
    const usageEventStore = new InMemoryUsageEventStore();
    const apiKeyStore = new InMemoryApiKeyStore();
    const authenticateRequest = createLocalAuth();

    const metadataHandler = createApiMetadataHandler({
      remoteAccessStore,
      usageEventStore,
      apiKeyStore,
      service: new FakeApiService(),
      authenticateRequest,
    });
    const shortHandler = createApiShortAnalysisHandler({
      remoteAccessStore,
      usageEventStore,
      apiKeyStore,
      service: new FakeApiService(),
      authenticateRequest,
    });
    const audioHandler = createApiAudioAnalysisHandler({
      remoteAccessStore,
      usageEventStore,
      apiKeyStore,
      service: new FakeApiService(),
      authenticateRequest,
    });

    const metadataResponse = await metadataHandler(
      new Request("https://example.com/api/v1/metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
        }),
      })
    );
    const metadataPayload = (await metadataResponse.json()) as {
      requestId: string;
      result: { videoId: string };
      account: { creditBalance: number };
    };
    assert.equal(metadataResponse.status, 200);
    assert.ok(metadataPayload.requestId.length > 0);
    assert.equal(metadataPayload.result.videoId, "test");
    assert.equal(metadataPayload.account.creditBalance, initialCredits);

    const shortResponse = await shortHandler(
      new Request("https://example.com/api/v1/analyze/short", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
        }),
      })
    );
    const shortPayload = (await shortResponse.json()) as {
      result: { analysis: { summary: string } };
      account: { accountId: string; creditBalance: number };
    };
    assert.equal(shortResponse.status, 200);
    assert.equal(shortPayload.result.analysis.summary, "short-analysis");
    assert.equal(shortPayload.account.accountId, accountId);
    assert.equal(shortPayload.account.creditBalance, initialCredits - 1);

    const streamedShortResponse = await shortHandler(
      new Request("https://example.com/api/v1/analyze/short", {
        method: "POST",
        headers: {
          accept: "application/x-ndjson",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
        }),
      })
    );
    const streamedLines = (await streamedShortResponse.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(streamedShortResponse.status, 200);
    assert.deepEqual(
      streamedLines.map((event) => event.type),
      ["progress", "progress", "progress", "progress", "progress", "result"]
    );
    assert.equal(streamedLines[0].message, "Checking the YouTube link.");
    assert.equal(streamedLines[1].message, "Checking your credits.");
    assert.equal(streamedLines[2].message, "Asking Gemini to analyze the video.");
    assert.equal(streamedLines[3].message, "Checking Gemini's response.");
    assert.equal(streamedLines[4].message, "Updating your account and finishing up.");
    assert.equal(
      ((streamedLines[5].payload as { result: { analysis: { summary: string } } }).result.analysis.summary),
      "short-analysis"
    );
    assert.equal(
      ((streamedLines[5].payload as { account: { creditBalance: number } }).account.creditBalance),
      initialCredits - 2
    );

    const audioResponse = await audioHandler(
      new Request("https://example.com/api/v1/analyze/audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
        }),
      })
    );
    const audioPayload = (await audioResponse.json()) as {
      result: { analysis: { summary: string } };
      account: { creditBalance: number };
    };
    assert.equal(audioResponse.status, 200);
    assert.equal(audioPayload.result.analysis.summary, "audio-analysis");
    assert.equal(audioPayload.account.creditBalance, initialCredits - 3);

    const usageEvents = await usageEventStore.listForAccount(accountId);
    assert.equal(usageEvents.filter((event) => event.kind === "credits.reserved").length, 3);
    assert.equal(usageEvents.filter((event) => event.kind === "credits.finalized").length, 3);
  }

  {
    const remoteAccessStore = new InMemoryRemoteAccessStore();
    const usageEventStore = new InMemoryUsageEventStore();
    const authenticateRequest = createLocalAuth();
    await remoteAccessStore.upsertAccount(principal);
    await remoteAccessStore.adjustAccountCredits(accountId, -initialCredits);

    const shortHandler = createApiShortAnalysisHandler({
      remoteAccessStore,
      usageEventStore,
      service: new FakeApiService(),
      authenticateRequest,
    });

    const insufficientCreditsResponse = await shortHandler(
      new Request("https://example.com/api/v1/analyze/short", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
        }),
      })
    );
    const insufficientCreditsPayload = (await insufficientCreditsResponse.json()) as {
      error: { code: string };
      account: { creditBalance: number };
    };
    assert.equal(insufficientCreditsResponse.status, 402);
    assert.equal(insufficientCreditsPayload.error.code, "INSUFFICIENT_CREDITS");
    assert.equal(insufficientCreditsPayload.account.creditBalance, 0);

    const streamedInsufficientCreditsResponse = await shortHandler(
      new Request("https://example.com/api/v1/analyze/short", {
        method: "POST",
        headers: {
          accept: "application/x-ndjson",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
        }),
      })
    );
    const streamedInsufficientLines = (await streamedInsufficientCreditsResponse.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(streamedInsufficientCreditsResponse.status, 200);
    assert.deepEqual(
      streamedInsufficientLines.map((event) => event.type),
      ["progress", "progress", "error"]
    );
    assert.equal(streamedInsufficientLines[2].status, 402);
    assert.equal(
      ((streamedInsufficientLines[2].payload as { error: { code: string } }).error.code),
      "INSUFFICIENT_CREDITS"
    );
    assert.equal(
      ((streamedInsufficientLines[2].lastProgress as { message: string }).message),
      "Checking your credits."
    );
  }

  {
    const remoteAccessStore = new InMemoryRemoteAccessStore();
    const usageEventStore = new InMemoryUsageEventStore();
    const authenticateRequest = createLocalAuth();
    const longAnalysisJobs: LongAnalysisJobs = {
      async enqueueLongAnalysis() {
        return {
          jobId: "job-api-1",
          status: "queued",
          pollTool: "get_long_youtube_video_analysis_job",
          estimatedNextPollSeconds: 5,
        };
      },
      async getLongAnalysisJob(jobId) {
        if (jobId === "missing-job") {
          return {
            jobId,
            status: "not_found",
            progress: null,
            result: null,
            error: null,
          };
        }

        return {
          jobId,
          status: "completed",
          progress: null,
          result: {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
            normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
            title: "Long API test video",
            durationSeconds: 720,
            strategyRequested: "auto",
            strategyUsed: "url_chunks",
            fallbackReason: null,
            modelsUsed: {
              chunkModel: "gemini-2.5-flash",
              finalModel: "gemini-2.5-pro",
            },
            chunkPlan: null,
            chunkCount: 3,
            tokenBudget: null,
            cacheUsed: false,
            sessionId: null,
            cacheName: null,
            usedCustomSchema: false,
            analysis: {
              summary: "long-analysis",
            },
          },
          error: null,
        };
      },
    };

    const startHandler = createApiLongJobStartHandler({
      remoteAccessStore,
      usageEventStore,
      longAnalysisJobs,
      authenticateRequest,
    });
    const statusHandler = createApiLongJobStatusHandler({
      remoteAccessStore,
      usageEventStore,
      longAnalysisJobs,
      authenticateRequest,
    });

    const startResponse = await startHandler(
      new Request("https://example.com/api/v1/long-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
        }),
      })
    );
    const startPayload = (await startResponse.json()) as {
      result: { jobId: string; status: string };
      account: { creditBalance: number };
    };
    assert.equal(startResponse.status, 202);
    assert.equal(startPayload.result.jobId, "job-api-1");
    assert.equal(startPayload.result.status, "queued");
    assert.equal(startPayload.account.creditBalance, initialCredits - 5);

    const statusResponse = await statusHandler(
      new Request("https://example.com/api/v1/long-jobs/job-api-1", {
        method: "GET",
      })
    );
    const statusPayload = (await statusResponse.json()) as {
      result: { status: string; result: { analysis: { summary: string } } | null };
      account: { creditBalance: number };
    };
    assert.equal(statusResponse.status, 200);
    assert.equal(statusPayload.result.status, "completed");
    assert.equal(statusPayload.result.result?.analysis.summary, "long-analysis");
    assert.equal(statusPayload.account.creditBalance, initialCredits - 5);

    const missingStatusResponse = await statusHandler(
      new Request("https://example.com/api/v1/long-jobs/missing-job", {
        method: "GET",
      })
    );
    const missingStatusPayload = (await missingStatusResponse.json()) as {
      error: { code: string };
    };
    assert.equal(missingStatusResponse.status, 404);
    assert.equal(missingStatusPayload.error.code, "LONG_ANALYSIS_JOB_NOT_FOUND");
  }
}
