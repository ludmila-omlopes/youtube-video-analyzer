import assert from "node:assert/strict";

import { DiagnosticError } from "../lib/errors.js";
import {
  extractYouTubeVideoId,
  fetchYouTubeVideoMetadata,
  getRequiredYouTubeApiKey,
  parseIso8601DurationToSeconds,
} from "../lib/youtube-metadata.js";

export async function run(): Promise<void> {
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=test123"), "test123");
  assert.equal(parseIso8601DurationToSeconds("PT15M1S"), 901);
  assert.equal(parseIso8601DurationToSeconds("P1DT2H"), 93_600);
  assert.equal(parseIso8601DurationToSeconds("bad"), null);

  const previousApiKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  assert.throws(() => getRequiredYouTubeApiKey(), (error: unknown) => {
    assert.ok(error instanceof DiagnosticError);
    assert.equal(error.code, "YOUTUBE_API_KEY_MISSING");
    return true;
  });

  process.env.YOUTUBE_API_KEY = "test-key";

  try {
    const metadata = await fetchYouTubeVideoMetadata({
      youtubeUrl: "https://youtu.be/test",
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input));
        assert.equal(url.searchParams.get("id"), "test");
        assert.equal(url.searchParams.get("key"), "test-key");
        return new Response(
          JSON.stringify({
            items: [
              {
                snippet: {
                  title: "Title",
                  description: "Description",
                  channelId: "channel-1",
                  channelTitle: "Channel",
                  publishedAt: "2026-03-24T00:00:00Z",
                  liveBroadcastContent: "live",
                  thumbnails: {
                    high: { url: "https://example.com/high.jpg", width: 480, height: 360 },
                  },
                  tags: ["a", "b"],
                  categoryId: "22",
                  defaultLanguage: "en",
                  defaultAudioLanguage: "en",
                },
                contentDetails: {
                  duration: "PT15M1S",
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
                  viewCount: "100",
                  likeCount: "20",
                  favoriteCount: "0",
                  commentCount: "5",
                },
                liveStreamingDetails: {
                  actualStartTime: "2026-03-24T00:00:00Z",
                  concurrentViewers: "88",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.deepEqual(metadata, {
      youtubeUrl: "https://youtu.be/test",
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
      videoId: "test",
      title: "Title",
      description: "Description",
      channelId: "channel-1",
      channelTitle: "Channel",
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
      liveBroadcastContent: "live",
      liveStreamingDetails: {
        actualStartTime: "2026-03-24T00:00:00Z",
        actualEndTime: null,
        scheduledStartTime: null,
        scheduledEndTime: null,
        concurrentViewers: 88,
      },
      thumbnails: {
        high: { url: "https://example.com/high.jpg", width: 480, height: 360 },
      },
      tags: ["a", "b"],
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

    await assert.rejects(
      () =>
        fetchYouTubeVideoMetadata({
          youtubeUrl: "https://youtu.be/missing",
          normalizedYoutubeUrl: "https://www.youtube.com/watch?v=missing",
          fetchImpl: async () =>
            new Response(JSON.stringify({ items: [] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        }),
      (error: unknown) => {
        assert.ok(error instanceof DiagnosticError);
        assert.equal(error.code, "YOUTUBE_VIDEO_NOT_FOUND");
        return true;
      }
    );
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.YOUTUBE_API_KEY;
    } else {
      process.env.YOUTUBE_API_KEY = previousApiKey;
    }
  }
}
