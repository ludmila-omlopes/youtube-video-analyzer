import { createAiClient } from "../lib/gemini.js";
import { createCloudSessionStore } from "./cloud-session-store.js";
import { InMemoryAnalysisSessionStore, type AnalysisSessionStore } from "./session-store.js";
import { VideoAnalysisService, type VideoAnalysisServiceDeps } from "./video-analysis-service.js";

export type CreateVideoAnalysisServiceOptions = {
  ai?: VideoAnalysisServiceDeps["ai"];
  sessionStore?: AnalysisSessionStore;
  runtimeMode?: "local" | "cloud";
};

export function createVideoAnalysisService(
  options: CreateVideoAnalysisServiceOptions = {}
): VideoAnalysisService {
  return new VideoAnalysisService({
    ai: options.ai ?? createAiClient(),
    sessionStore: options.sessionStore ?? new InMemoryAnalysisSessionStore(),
    runtimeMode: options.runtimeMode ?? "local",
  });
}

export function createCloudVideoAnalysisService(
  options: Omit<CreateVideoAnalysisServiceOptions, "sessionStore" | "runtimeMode"> = {}
): VideoAnalysisService {
  return new VideoAnalysisService({
    ai: options.ai ?? createAiClient(),
    sessionStore: createCloudSessionStore(),
    runtimeMode: "cloud",
  });
}
