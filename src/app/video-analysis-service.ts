import type { GoogleGenAI } from "@google/genai";

import {
  analyzeLongVideo,
  analyzeShortVideo,
  continueLongVideoAnalysis,
  type AnalysisExecutionContext,
} from "../lib/analysis.js";
import { DiagnosticError } from "../lib/errors.js";
import type {
  FollowUpToolInput,
  FollowUpToolOutput,
  LongToolInput,
  LongToolOutput,
  MetadataToolInput,
  MetadataToolOutput,
  ShortToolInput,
  ShortToolOutput,
} from "../lib/schemas.js";
import { fetchYouTubeVideoMetadata } from "../lib/youtube-metadata.js";
import { normalizeYouTubeUrl } from "../lib/youtube.js";
import { getLongVideoRuntimeCapabilities } from "../lib/youtube.js";
import type { AnalysisSessionStore } from "./session-store.js";

export type VideoAnalysisServiceDeps = {
  ai: GoogleGenAI;
  sessionStore: AnalysisSessionStore;
  runtimeMode?: "local" | "cloud";
};

export interface VideoAnalysisServiceLike {
  analyzeShort(input: ShortToolInput, context: AnalysisExecutionContext): Promise<ShortToolOutput>;
  analyzeLong(input: LongToolInput, context: AnalysisExecutionContext): Promise<LongToolOutput>;
  continueLong(input: FollowUpToolInput, context: AnalysisExecutionContext): Promise<FollowUpToolOutput>;
  getYouTubeMetadata(input: MetadataToolInput, context: AnalysisExecutionContext): Promise<MetadataToolOutput>;
}

export class VideoAnalysisService implements VideoAnalysisServiceLike {
  private readonly runtimeMode: "local" | "cloud";

  constructor(private readonly deps: VideoAnalysisServiceDeps) {
    this.runtimeMode = deps.runtimeMode ?? "local";
  }

  async analyzeShort(input: ShortToolInput, context: AnalysisExecutionContext): Promise<ShortToolOutput> {
    return analyzeShortVideo(this.deps.ai, input, context);
  }

  async analyzeLong(input: LongToolInput, context: AnalysisExecutionContext): Promise<LongToolOutput> {
    if (this.runtimeMode === "cloud") {
      await this.assertCloudLongVideoRuntime(input, context);
    }

    return analyzeLongVideo(this.deps.ai, this.deps.sessionStore, input, context);
  }

  async continueLong(input: FollowUpToolInput, context: AnalysisExecutionContext): Promise<FollowUpToolOutput> {
    return continueLongVideoAnalysis(this.deps.ai, this.deps.sessionStore, input, context);
  }

  async getYouTubeMetadata(input: MetadataToolInput, context: AnalysisExecutionContext): Promise<MetadataToolOutput> {
    const normalizedYoutubeUrl = normalizeYouTubeUrl(input.youtubeUrl);
    if (!normalizedYoutubeUrl) {
      throw new DiagnosticError({
        tool: context.tool,
        code: "INVALID_YOUTUBE_URL",
        stage: "metadata",
        message: "youtubeUrl must be a valid YouTube video URL.",
        retryable: false,
      });
    }

    return fetchYouTubeVideoMetadata({
      youtubeUrl: input.youtubeUrl,
      normalizedYoutubeUrl,
      signal: context.abortSignal,
    });
  }

  private async assertCloudLongVideoRuntime(
    input: LongToolInput,
    context: AnalysisExecutionContext
  ): Promise<void> {
    const strategyRequested = input.strategy ?? "auto";
    if (strategyRequested !== "uploaded_file") {
      return;
    }

    const capabilities = await getLongVideoRuntimeCapabilities(strategyRequested);

    if (capabilities.supported) {
      return;
    }

    throw new DiagnosticError({
      tool: context.tool,
      code: "LONG_VIDEO_RUNTIME_UNAVAILABLE",
      stage: "download",
      message: "Cloud runtime is missing required dependencies for long-video analysis.",
      retryable: false,
      strategyRequested,
      strategyAttempted: "uploaded_file",
      details: capabilities,
    });
  }
}
