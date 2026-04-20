import {
  createDefaultAiClient,
  VideoAnalysisService,
  createVideoAnalysisService,
  type CreateVideoAnalysisServiceOptions,
} from "@ludylops/video-analysis-core";
import { createCloudSessionStore } from "./sessions.js";

export { createVideoAnalysisService };

export type { CreateVideoAnalysisServiceOptions };

export function createCloudVideoAnalysisService(
  options: Omit<CreateVideoAnalysisServiceOptions, "sessionStore" | "runtimeMode"> = {}
): VideoAnalysisService {
  return new VideoAnalysisService({
    ai: options.ai ?? createDefaultAiClient(),
    sessionStore: createCloudSessionStore(),
    runtimeMode: "cloud",
  });
}
