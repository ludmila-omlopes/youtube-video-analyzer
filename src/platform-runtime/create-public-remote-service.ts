import {
  createDefaultAiClient,
  VideoAnalysisService,
  type VideoAnalysisServiceDeps,
  type VideoAnalysisServiceLike,
} from "../youtube-core/index.js";
import { createCloudSessionStore } from "./sessions.js";

export type CreatePublicRemoteVideoAnalysisServiceOptions = {
  ai?: VideoAnalysisServiceDeps["ai"];
  sessionStore?: VideoAnalysisServiceDeps["sessionStore"];
};

export function createPublicRemoteVideoAnalysisService(
  options: CreatePublicRemoteVideoAnalysisServiceOptions = {}
): VideoAnalysisServiceLike {
  return new VideoAnalysisService({
    ai: options.ai ?? createDefaultAiClient(),
    sessionStore: options.sessionStore ?? createCloudSessionStore(),
    runtimeMode: "cloud",
  });
}
