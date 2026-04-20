import assert from "node:assert/strict";

import {
  createPrincipalScopedLongAnalysisJobs,
  getPrincipalKey,
  InMemoryRemoteAccessStore,
  InMemoryUsageEventStore,
  type AuthPrincipal,
} from "../auth-billing/index.js";
import type { LongAnalysisJobs } from "../platform-runtime/index.js";
import type { LongToolInput } from "@ludylops/video-analysis-core";

const principalA: AuthPrincipal = {
  subject: "google-oauth2|user-a",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-video-analyzer.onrender.com/",
  scope: [],
  tokenId: "token-a",
  rawClaims: {},
};

const principalB: AuthPrincipal = {
  subject: "google-oauth2|user-b",
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-video-analyzer.onrender.com/",
  scope: [],
  tokenId: "token-b",
  rawClaims: {},
};

export async function run(): Promise<void> {
  const prevCredits = process.env.REMOTE_ACCOUNT_INITIAL_CREDITS;
  process.env.REMOTE_ACCOUNT_INITIAL_CREDITS = "8";

  try {
    const remoteAccessStore = new InMemoryRemoteAccessStore();
    const usageEvents = new InMemoryUsageEventStore();
    const capturedInputs: LongToolInput[] = [];
    let enqueueCount = 0;
    const baseJobs: LongAnalysisJobs = {
      async enqueueLongAnalysis(input: LongToolInput) {
        enqueueCount += 1;
        capturedInputs.push(input);
        return {
          jobId: `job-${enqueueCount}`,
          status: "queued",
          pollTool: "get_long_youtube_video_analysis_job",
          estimatedNextPollSeconds: 5,
        };
      },
      async getLongAnalysisJob(jobId: string) {
        if (jobId === "job-2") {
          return {
            jobId,
            status: "failed" as const,
            progress: null,
            result: null,
            error: {
              message: "boom",
              code: null,
              stage: null,
              retryable: null,
            },
          };
        }

        return {
          jobId,
          status: "completed" as const,
          progress: null,
          result: null,
          error: null,
        };
      },
    };

    const userAJobs = createPrincipalScopedLongAnalysisJobs(baseJobs, principalA, remoteAccessStore, usageEvents);
    const userBJobs = createPrincipalScopedLongAnalysisJobs(baseJobs, principalB, remoteAccessStore, usageEvents);
    const accountIdA = getPrincipalKey(principalA);

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
    assert.equal(await remoteAccessStore.getJobOwner("job-1"), accountIdA);
    const reservationIdJob1 = await remoteAccessStore.getJobCreditReservation("job-1");
    assert.ok(reservationIdJob1);
    assert.equal((await remoteAccessStore.getAccount(accountIdA))?.creditBalance, 4);
    assert.deepEqual(
      (await usageEvents.listForAccount(accountIdA)).map((event) => event.kind),
      ["analysis.long_job.queued", "credits.reserved"]
    );

    const ownJob = await userAJobs.getLongAnalysisJob("job-1");
    assert.equal(ownJob.status, "completed");
    assert.equal(await remoteAccessStore.getJobCreditReservation("job-1"), null);
    assert.equal((await remoteAccessStore.getCreditReservation(accountIdA, reservationIdJob1 ?? ""))?.state, "finalized");
    assert.deepEqual(
      (await usageEvents.listForAccount(accountIdA)).map((event) => event.kind),
      ["credits.finalized", "analysis.long_job.queued", "credits.reserved"]
    );

    const secondEnqueue = await userAJobs.enqueueLongAnalysis({
      youtubeUrl: "https://www.youtube.com/watch?v=fail",
      strategy: "url_chunks",
    });
    const reservationIdJob2 = await remoteAccessStore.getJobCreditReservation(secondEnqueue.jobId);
    assert.ok(reservationIdJob2);
    assert.equal((await remoteAccessStore.getAccount(accountIdA))?.creditBalance, 0);

    const failedJob = await userAJobs.getLongAnalysisJob(secondEnqueue.jobId);
    assert.equal(failedJob.status, "failed");
    assert.equal(await remoteAccessStore.getJobCreditReservation(secondEnqueue.jobId), null);
    assert.equal((await remoteAccessStore.getCreditReservation(accountIdA, reservationIdJob2 ?? ""))?.state, "released");
    assert.equal((await remoteAccessStore.getAccount(accountIdA))?.creditBalance, 4);
    assert.deepEqual(
      (await usageEvents.listForAccount(accountIdA)).map((event) => event.kind).slice(0, 4),
      ["credits.released", "analysis.long_job.queued", "credits.reserved", "credits.finalized"]
    );

    const foreignJob = await userBJobs.getLongAnalysisJob("job-1");
    assert.deepEqual(foreignJob, {
      jobId: "job-1",
      status: "not_found",
      progress: null,
      result: null,
      error: null,
    });
  } finally {
    if (prevCredits === undefined) {
      delete process.env.REMOTE_ACCOUNT_INITIAL_CREDITS;
    } else {
      process.env.REMOTE_ACCOUNT_INITIAL_CREDITS = prevCredits;
    }
  }
}
