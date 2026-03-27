import { createAiClient } from "../lib/gemini.js";
import { createCloudSessionStore } from "./cloud-session-store.js";
import { VideoAnalysisService, type VideoAnalysisServiceDeps, type VideoAnalysisServiceLike } from "./video-analysis-service.js";

export type CreatePublicRemoteVideoAnalysisServiceOptions = {
  ai?: VideoAnalysisServiceDeps["ai"];
  sessionStore?: VideoAnalysisServiceDeps["sessionStore"];
};

export function createPublicRemoteVideoAnalysisService(
  options: CreatePublicRemoteVideoAnalysisServiceOptions = {}
): VideoAnalysisServiceLike {
  return new VideoAnalysisService({
    ai: options.ai ?? createAiClient(),
    sessionStore: options.sessionStore ?? createCloudSessionStore(),
    runtimeMode: "cloud",
  });
}
