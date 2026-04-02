import { getPrincipalKey, type AuthPrincipal } from "../lib/auth/principal.js";
import type { GetLongAnalysisJobToolOutput } from "../lib/schemas.js";

import type { LongAnalysisJobs } from "./long-analysis-jobs.js";
import type { RemoteAccessStore } from "./remote-access-store.js";

function createNotFoundJobResponse(jobId: string): GetLongAnalysisJobToolOutput {
  return {
    jobId,
    status: "not_found",
    progress: null,
    result: null,
    error: null,
  };
}

export function createPrincipalScopedLongAnalysisJobs(
  jobs: LongAnalysisJobs,
  principal: AuthPrincipal,
  remoteAccessStore: RemoteAccessStore
): LongAnalysisJobs {
  const accountId = getPrincipalKey(principal);

  return {
    async enqueueLongAnalysis(input) {
      await remoteAccessStore.upsertAccount(principal);
      const result = await jobs.enqueueLongAnalysis(input);
      await remoteAccessStore.setJobOwner(result.jobId, accountId);
      return result;
    },
    async getLongAnalysisJob(jobId) {
      const ownerId = await remoteAccessStore.getJobOwner(jobId);
      if (!ownerId || ownerId !== accountId) {
        return createNotFoundJobResponse(jobId);
      }

      return await jobs.getLongAnalysisJob(jobId);
    },
  };
}
