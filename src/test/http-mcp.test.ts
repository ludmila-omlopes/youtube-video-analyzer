import assert from "node:assert/strict";

import type { LongAnalysisJobs } from "../app/long-analysis-jobs.js";
import { InMemoryApiKeyStore } from "../auth-billing/index.js";
import type { AuthPrincipal } from "../lib/auth/principal.js";
import { authenticateMcpRequest } from "../http/authenticate-mcp-request.js";
import { handleProtectedMcpHttpRequest } from "../http/handle-protected-mcp-request.js";
import { createMcpHttpHandler } from "../http/mcp.js";
import { createConnectedHttpClient } from "./test-helpers.js";

const HOSTED_ENV_KEYS = [
  "ALLOW_UNAUTHENTICATED_HOSTED_DEV",
  "OAUTH_ENABLED",
  "OAUTH_ISSUER",
  "OAUTH_AUDIENCE",
  "OAUTH_JWKS_URL",
  "OAUTH_REQUIRED_SCOPE",
] as const;

const protectedPrincipal: AuthPrincipal = {
  subject: "mcp-api-user",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer.onrender.com/api/mcp",
  scope: ["mcp:access"],
  tokenId: null,
  rawClaims: {},
};

async function withEnv(
  updates: Partial<Record<(typeof HOSTED_ENV_KEYS)[number], string | undefined>>,
  runWithEnv: () => Promise<void>
): Promise<void> {
  const previous = Object.fromEntries(HOSTED_ENV_KEYS.map((key) => [key, process.env[key]])) as Partial<
    Record<(typeof HOSTED_ENV_KEYS)[number], string | undefined>
  >;

  try {
    for (const key of HOSTED_ENV_KEYS) {
      const next = updates[key];
      if (next === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = next;
      }
    }

    await runWithEnv();
  } finally {
    for (const key of HOSTED_ENV_KEYS) {
      const next = previous[key];
      if (next === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = next;
      }
    }
  }
}

export async function run(): Promise<void> {
  const longAnalysisJobs: LongAnalysisJobs = {
    async enqueueLongAnalysis() {
      return {
        jobId: "job-http-1",
        status: "queued",
        pollTool: "get_long_youtube_video_analysis_job",
        estimatedNextPollSeconds: 5,
      };
    },
    async getLongAnalysisJob(jobId) {
      return {
        jobId,
        status: "running",
        progress: {
          progress: 35,
          total: 100,
          message: "Analyzing chunks",
        },
        result: null,
        error: null,
      };
    },
  };

  const handler = createMcpHttpHandler({
    longAnalysisJobs,
    service: {
      async analyzeShort(input) {
        return {
          model: "gemini-test",
          youtubeUrl: input.youtubeUrl,
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          clip: { startOffsetSeconds: null, endOffsetSeconds: null },
          usedCustomSchema: false,
          analysis: { summary: "http-short" },
        };
      },
      async analyzeAudio(input) {
        return {
          model: input.model || "gemini-3-flash-preview",
          youtubeUrl: input.youtubeUrl,
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          clip: { startOffsetSeconds: null, endOffsetSeconds: null },
          usedCustomSchema: false,
          analysis: {
            detectedLanguage: "en",
            summary: "http-audio",
            topics: ["topic"],
            transcriptSegments: [
              {
                timestamp: "00:12",
                transcript: "Short excerpt.",
                translation: "",
              },
            ],
            notableQuotes: ["Short excerpt."],
            actionItems: [],
            safetyOrAccuracyNotes: [],
          },
        };
      },
      async analyzeLong() {
        throw new Error("Not used");
      },
      async continueLong() {
        throw new Error("Not used");
      },
      async getYouTubeMetadata(input) {
        return {
          youtubeUrl: input.youtubeUrl,
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          videoId: "test",
          title: "HTTP Test",
          description: "Metadata",
          channelId: "channel-1",
          channelTitle: "Test Channel",
          publishedAt: "2026-03-24T00:00:00Z",
          durationIso8601: "PT15M1S",
          durationSeconds: 901,
          definition: "hd",
          caption: true,
          licensedContent: false,
          projection: "rectangular",
          dimension: "2d",
          privacyStatus: "public",
          embeddable: true,
          liveBroadcastContent: "none",
          liveStreamingDetails: null,
          thumbnails: {
            default: { url: "https://example.com/default.jpg", width: 120, height: 90 },
          },
          tags: ["test"],
          categoryId: "22",
          defaultLanguage: "en",
          defaultAudioLanguage: "en",
          statistics: {
            viewCount: 100,
            likeCount: 20,
            favoriteCount: 0,
            commentCount: 5,
          },
        };
      },
    },
  });

  await withEnv(
    {
      ALLOW_UNAUTHENTICATED_HOSTED_DEV: undefined,
      OAUTH_ENABLED: undefined,
      OAUTH_ISSUER: undefined,
      OAUTH_AUDIENCE: undefined,
      OAUTH_JWKS_URL: undefined,
      OAUTH_REQUIRED_SCOPE: undefined,
    },
    async () => {
      const protectedResponse = await handleProtectedMcpHttpRequest(
        new Request("https://example.test/api/mcp", { method: "POST" })
      );
      const payload = (await protectedResponse.json()) as { error: string };
      assert.equal(protectedResponse.status, 503);
      assert.equal(payload.error, "server_configuration_error");
    }
  );

  await withEnv(
    {
      ALLOW_UNAUTHENTICATED_HOSTED_DEV: "true",
      OAUTH_ENABLED: undefined,
      OAUTH_ISSUER: undefined,
      OAUTH_AUDIENCE: undefined,
      OAUTH_JWKS_URL: undefined,
      OAUTH_REQUIRED_SCOPE: undefined,
    },
    async () => {
      const client = await createConnectedHttpClient(handler);

      try {
        const result = await client.callTool({
          name: "analyze_youtube_video",
          arguments: {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
          },
        });

        assert.deepEqual(result.structuredContent, {
          model: "gemini-test",
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          clip: { startOffsetSeconds: null, endOffsetSeconds: null },
          usedCustomSchema: false,
          analysis: { summary: "http-short" },
        });

        const audioResult = await client.callTool({
          name: "analyze_youtube_video_audio",
          arguments: {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
          },
        });

        assert.deepEqual(audioResult.structuredContent, {
          model: "gemini-3-flash-preview",
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          clip: { startOffsetSeconds: null, endOffsetSeconds: null },
          usedCustomSchema: false,
          analysis: {
            detectedLanguage: "en",
            summary: "http-audio",
            topics: ["topic"],
            transcriptSegments: [
              {
                timestamp: "00:12",
                transcript: "Short excerpt.",
                translation: "",
              },
            ],
            notableQuotes: ["Short excerpt."],
            actionItems: [],
            safetyOrAccuracyNotes: [],
          },
        });

        const startLongResult = await client.callTool({
          name: "start_long_youtube_video_analysis",
          arguments: {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
          },
        });

        assert.deepEqual(startLongResult.structuredContent, {
          jobId: "job-http-1",
          status: "queued",
          pollTool: "get_long_youtube_video_analysis_job",
          estimatedNextPollSeconds: 5,
        });

        const getLongResult = await client.callTool({
          name: "get_long_youtube_video_analysis_job",
          arguments: {
            jobId: "job-http-1",
          },
        });

        assert.deepEqual(getLongResult.structuredContent, {
          jobId: "job-http-1",
          status: "running",
          progress: {
            progress: 35,
            total: 100,
            message: "Analyzing chunks",
          },
          result: null,
          error: null,
        });

        const missingLongToolResult = await client.callTool({
          name: "analyze_long_youtube_video",
          arguments: {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
          },
        });

        assert.equal(missingLongToolResult.isError, true);

        const metadataResult = await client.callTool({
          name: "get_youtube_video_metadata",
          arguments: {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
          },
        });

        assert.deepEqual(metadataResult.structuredContent, {
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          videoId: "test",
          title: "HTTP Test",
          description: "Metadata",
          channelId: "channel-1",
          channelTitle: "Test Channel",
          publishedAt: "2026-03-24T00:00:00Z",
          durationIso8601: "PT15M1S",
          durationSeconds: 901,
          definition: "hd",
          caption: true,
          licensedContent: false,
          projection: "rectangular",
          dimension: "2d",
          privacyStatus: "public",
          embeddable: true,
          liveBroadcastContent: "none",
          liveStreamingDetails: null,
          thumbnails: {
            default: { url: "https://example.com/default.jpg", width: 120, height: 90 },
          },
          tags: ["test"],
          categoryId: "22",
          defaultLanguage: "en",
          defaultAudioLanguage: "en",
          statistics: {
            viewCount: 100,
            likeCount: 20,
            favoriteCount: 0,
            commentCount: 5,
          },
        });
      } finally {
        await client.close();
      }
    }
  );

  await withEnv(
    {
      ALLOW_UNAUTHENTICATED_HOSTED_DEV: undefined,
      OAUTH_ENABLED: "true",
      OAUTH_ISSUER: "https://issuer.example.com/",
      OAUTH_AUDIENCE: "https://youtube-analyzer.onrender.com/api/mcp",
      OAUTH_JWKS_URL: "https://issuer.example.com/.well-known/jwks.json",
      OAUTH_REQUIRED_SCOPE: "mcp:access",
    },
    async () => {
      const apiKeyStore = new InMemoryApiKeyStore();
      const createdApiKey = await apiKeyStore.createApiKey(protectedPrincipal, "Protected MCP key");
      const protectedHandler = async (request: Request): Promise<Response> => {
        const headers = new Headers(request.headers);
        headers.set("authorization", `ApiKey ${createdApiKey.plaintextKey}`);
        const authenticatedRequest = new Request(request, { headers });
        const auth = await authenticateMcpRequest(authenticatedRequest, {
          apiKeyStore,
          config: {
            enabled: true,
            issuer: "https://issuer.example.com/",
            audience: "https://youtube-analyzer.onrender.com/api/mcp",
            jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
            requiredScope: "mcp:access",
            resourceName: "youtube-video-analyzer-mcp",
            clockToleranceSeconds: 5,
          },
        });
        if (!auth.ok) {
          return auth.response;
        }

        return handler(authenticatedRequest, { principal: auth.principal });
      };

      const client = await createConnectedHttpClient(protectedHandler);
      try {
        const result = await client.callTool({
          name: "analyze_youtube_video",
          arguments: {
            youtubeUrl: "https://www.youtube.com/watch?v=test",
          },
        });

        assert.deepEqual(result.structuredContent, {
          model: "gemini-test",
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
          clip: { startOffsetSeconds: null, endOffsetSeconds: null },
          usedCustomSchema: false,
          analysis: { summary: "http-short" },
        });
      } finally {
        await client.close();
      }
    }
  );
}
