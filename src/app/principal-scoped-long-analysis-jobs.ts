import type { AuthPrincipal } from "../lib/auth/principal.js";

import type { LongAnalysisJobs } from "./long-analysis-jobs.js";

export function createPrincipalScopedLongAnalysisJobs(
  jobs: LongAnalysisJobs,
  _principal: AuthPrincipal
): LongAnalysisJobs {
  return jobs;
}
