import type { AuthPrincipal } from "../lib/auth/principal.js";

import type { VideoAnalysisServiceLike } from "./video-analysis-service.js";

export function createPrincipalScopedService(
  service: VideoAnalysisServiceLike,
  _principal: AuthPrincipal
): VideoAnalysisServiceLike {
  return service;
}
