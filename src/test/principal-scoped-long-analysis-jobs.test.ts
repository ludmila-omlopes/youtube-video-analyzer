import assert from "node:assert/strict";

import { createPrincipalScopedLongAnalysisJobs } from "../app/principal-scoped-long-analysis-jobs.js";
import type { LongAnalysisJobs } from "../app/long-analysis-jobs.js";
import { InMemoryRemoteAccessStore } from "../app/remote-access-store.js";
import { getPrincipalKey, type AuthPrincipal } from "../lib/auth/principal.js";
import type { LongToolInput } from "../lib/schemas.js";

const principalA: AuthPrincipal = {
  subject: "google-oauth2|user-a",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer-mcp.onrender.com/api/mcp",
  scope: [],
  tokenId: "token-a",
  rawClaims: {},
};

const principalB: AuthPrincipal = {
  subject: "google-oauth2|user-b",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer-mcp.onrender.com/api/mcp",
  scope: [],
  tokenId: "token-b",
  rawClaims: {},
};

export async function run(): Promise<void> {
  const remoteAccessStore = new InMemoryRemoteAccessStore();
  const capturedInputs: LongToolInput[] = [];
  const baseJobs: LongAnalysisJobs = {
    async enqueueLongAnalysis(input: LongToolInput) {
      capturedInputs.push(input);
      return {
        jobId: "job-1",
        status: "queued",
        pollTool: "get_long_youtube_video_analysis_job",
        estimatedNextPollSeconds: 5,
      };
    },
    async getLongAnalysisJob(jobId: string) {
      return {
        jobId,
        status: "completed" as const,
        progress: null,
        result: null,
        error: null,
      };
    },
  };

  const userAJobs = createPrincipalScopedLongAnalysisJobs(baseJobs, principalA, remoteAccessStore);
  const userBJobs = createPrincipalScopedLongAnalysisJobs(baseJobs, principalB, remoteAccessStore);

  const enqueueResult = await userAJobs.enqueueLongAnalysis({
    youtubeUrl: "https://www.youtube.com/watch?v=test",
    strategy: "url_chunks",
  });

  assert.equal(enqueueResult.jobId, "job-1");
  assert.deepEqual(capturedInputs, [
    {
      youtubeUrl: "https://www.youtube.com/watch?v=test",
      strategy: "url_chunks",
    },
  ]);
  assert.equal(await remoteAccessStore.getJobOwner("job-1"), getPrincipalKey(principalA));

  const ownJob = await userAJobs.getLongAnalysisJob("job-1");
  assert.equal(ownJob.status, "completed");

  const foreignJob = await userBJobs.getLongAnalysisJob("job-1");
  assert.deepEqual(foreignJob, {
    jobId: "job-1",
    status: "not_found",
    progress: null,
    result: null,
    error: null,
  });
}
