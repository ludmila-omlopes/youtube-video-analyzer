import {
  createDefaultAiClient,
  VideoAnalysisService,
  type VideoAnalysisServiceDeps,
} from "../youtube-core/index.js";
import {
  createCloudSessionStore,
  InMemoryAnalysisSessionStore,
  type AnalysisSessionStore,
} from "./sessions.js";

export type CreateVideoAnalysisServiceOptions = {
  ai?: VideoAnalysisServiceDeps["ai"];
  sessionStore?: AnalysisSessionStore;
  runtimeMode?: "local" | "cloud";
};

export function createVideoAnalysisService(
  options: CreateVideoAnalysisServiceOptions = {}
): VideoAnalysisService {
  return new VideoAnalysisService({
    ai: options.ai ?? createDefaultAiClient(),
    sessionStore: options.sessionStore ?? new InMemoryAnalysisSessionStore(),
    runtimeMode: options.runtimeMode ?? "local",
  });
}

export function createCloudVideoAnalysisService(
  options: Omit<CreateVideoAnalysisServiceOptions, "sessionStore" | "runtimeMode"> = {}
): VideoAnalysisService {
  return new VideoAnalysisService({
    ai: options.ai ?? createDefaultAiClient(),
    sessionStore: createCloudSessionStore(),
    runtimeMode: "cloud",
  });
}
