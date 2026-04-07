import { randomUUID } from "node:crypto";

import { DiagnosticError } from "../lib/errors.js";
import type { GetLongAnalysisJobToolOutput } from "../youtube-core/schemas.js";
import type { LongAnalysisJobs } from "../platform-runtime/long-analysis-jobs.js";
import { settleLongJobCreditReservation } from "./long-job-credit-settlement.js";
import { getLongAnalysisChargeCredits } from "./pricing.js";
import { getPrincipalKey, type AuthPrincipal } from "./principal.js";
import type { RemoteAccount } from "./remote-account.js";
import type { RemoteAccessStore } from "./remote-access-store.js";
import {
  createUsageEventStoreFromEnv,
  type UsageEventStore,
} from "./usage-events.js";

function createNotFoundJobResponse(jobId: string): GetLongAnalysisJobToolOutput {
  return {
    jobId,
    status: "not_found",
    progress: null,
    result: null,
    error: null,
  };
}

function assertLongJobAllowed(account: RemoteAccount | null, charge: number): void {
  if (!account) {
    throw new DiagnosticError({
      tool: "start_long_youtube_video_analysis",
      code: "REMOTE_ACCOUNT_NOT_FOUND",
      stage: "unknown",
      message: "Remote account record is missing; try reconnecting the MCP client.",
      retryable: true,
    });
  }

  if (account.status === "suspended") {
    throw new DiagnosticError({
      tool: "start_long_youtube_video_analysis",
      code: "REMOTE_ACCOUNT_SUSPENDED",
      stage: "unknown",
      message: "This account is suspended and cannot queue remote long analysis jobs.",
      retryable: false,
      details: { accountId: account.accountId },
    });
  }

  if (account.creditBalance < charge) {
    throw new DiagnosticError({
      tool: "start_long_youtube_video_analysis",
      code: "INSUFFICIENT_CREDITS",
      stage: "unknown",
      message: `Not enough credits for this operation (${charge} required).`,
      retryable: false,
      details: { requiredCredits: charge, creditBalance: account.creditBalance },
    });
  }
}

export function createPrincipalScopedLongAnalysisJobs(
  jobs: LongAnalysisJobs,
  principal: AuthPrincipal,
  remoteAccessStore: RemoteAccessStore,
  usageEventStore: UsageEventStore = createUsageEventStoreFromEnv()
): LongAnalysisJobs {
  const accountId = getPrincipalKey(principal);

  return {
    async enqueueLongAnalysis(input) {
      await remoteAccessStore.upsertAccount(principal);

      const charge = getLongAnalysisChargeCredits(input);
      const account = await remoteAccessStore.getAccount(accountId);
      assertLongJobAllowed(account, charge);

      const reservationId = `long-job:${randomUUID()}`;
      const reserved = await remoteAccessStore.reserveCredits(accountId, {
        reservationId,
        credits: charge,
        tool: "start_long_youtube_video_analysis",
        metadata: {
          youtubeUrl: input.youtubeUrl,
          strategyRequested: input.strategy ?? "auto",
        },
      });
      if (!reserved) {
        const latestAccount = await remoteAccessStore.getAccount(accountId);
        assertLongJobAllowed(latestAccount, charge);
        throw new DiagnosticError({
          tool: "start_long_youtube_video_analysis",
          code: "CREDIT_RESERVATION_FAILED",
          stage: "unknown",
          message: "Unable to reserve credits for this long analysis job right now.",
          retryable: true,
        });
      }

      if (reserved.changed) {
        await usageEventStore.append({
          accountId,
          kind: "credits.reserved",
          tool: "start_long_youtube_video_analysis",
          creditsDelta: -charge,
          creditsBalance: reserved.account.creditBalance,
          metadata: {
            reservationId,
            chargeCredits: charge,
            strategyRequested: input.strategy ?? "auto",
            youtubeUrl: input.youtubeUrl,
          },
        });
      }

      try {
        const result = await jobs.enqueueLongAnalysis(input);
        await remoteAccessStore.setJobOwner(result.jobId, accountId);
        await remoteAccessStore.setJobCreditReservation(result.jobId, reservationId);
        await usageEventStore.append({
          accountId,
          kind: "analysis.long_job.queued",
          tool: "start_long_youtube_video_analysis",
          metadata: {
            jobId: result.jobId,
            reservationId,
            chargeCredits: charge,
            strategyRequested: input.strategy ?? "auto",
            youtubeUrl: input.youtubeUrl,
          },
        });
        return result;
      } catch (error) {
        const released = await remoteAccessStore.releaseCreditReservation(accountId, reservationId);
        if (released?.changed) {
          await usageEventStore.append({
            accountId,
            kind: "credits.released",
            tool: "start_long_youtube_video_analysis",
            creditsDelta: charge,
            creditsBalance: released.account.creditBalance,
            metadata: {
              reservationId,
              chargeCredits: charge,
              strategyRequested: input.strategy ?? "auto",
              youtubeUrl: input.youtubeUrl,
            },
          });
        } else if (released === null) {
          await usageEventStore.append({
            accountId,
            kind: "credits.release_failed",
            tool: "start_long_youtube_video_analysis",
            metadata: {
              reservationId,
              chargeCredits: charge,
              strategyRequested: input.strategy ?? "auto",
              youtubeUrl: input.youtubeUrl,
            },
          });
        }

        throw error;
      }
    },
    async getLongAnalysisJob(jobId) {
      const ownerId = await remoteAccessStore.getJobOwner(jobId);
      if (!ownerId || ownerId !== accountId) {
        return createNotFoundJobResponse(jobId);
      }

      const result = await jobs.getLongAnalysisJob(jobId);
      await settleLongJobCreditReservation(jobId, result.status, remoteAccessStore, usageEventStore);
      return result;
    },
  };
}
