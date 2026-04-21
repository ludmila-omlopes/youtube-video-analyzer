import {
  DiagnosticError,
  type AnalysisExecutionContext,
  type VideoAnalysisServiceLike,
} from "@ludylops/video-analysis-core";
import { getAudioAnalysisChargeCredits, getShortAnalysisChargeCredits } from "./pricing.js";
import { getPrincipalKey, type AuthPrincipal } from "./principal.js";
import type { RemoteAccount } from "./remote-account.js";
import type { RemoteAccessStore } from "./remote-access-store.js";
import {
  createUsageEventStoreFromEnv,
  type UsageEventKind,
  type UsageEventStore,
} from "./usage-events.js";

function assertPaidRemoteToolAllowed(account: RemoteAccount | null, charge: number, tool: string): void {
  if (!account) {
    throw new DiagnosticError({
      tool,
      code: "REMOTE_ACCOUNT_NOT_FOUND",
      stage: "unknown",
      message: "Remote account record is missing; try reconnecting the MCP client.",
      retryable: true,
    });
  }

  if (account.status === "suspended") {
    throw new DiagnosticError({
      tool,
      code: "REMOTE_ACCOUNT_SUSPENDED",
      stage: "unknown",
      message: "This account is suspended and cannot run remote analysis tools.",
      retryable: false,
      details: { accountId: account.accountId },
    });
  }

  if (account.creditBalance < charge) {
    throw new DiagnosticError({
      tool,
      code: "INSUFFICIENT_CREDITS",
      stage: "unknown",
      message: `Not enough credits for this operation (${charge} required).`,
      retryable: false,
      details: { requiredCredits: charge, creditBalance: account.creditBalance },
    });
  }
}

async function appendUsageEventSafe(
  usageEventStore: UsageEventStore,
  context: AnalysisExecutionContext,
  event: Parameters<UsageEventStore["append"]>[0]
): Promise<void> {
  try {
    await usageEventStore.append(event);
  } catch (error) {
    context.logger.warn("remote.usage_event.append_failed", {
      tool: context.tool,
      kind: event.kind,
      accountId: event.accountId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getReservationId(context: AnalysisExecutionContext): string {
  return `analysis:${context.tool}:${context.logger.requestId}`;
}

async function reserveCreditsOrThrow(
  remoteAccessStore: RemoteAccessStore,
  accountId: string,
  charge: number,
  context: AnalysisExecutionContext,
  metadata: Record<string, unknown>
) {
  const beforeReserve = await remoteAccessStore.getAccount(accountId);
  assertPaidRemoteToolAllowed(beforeReserve, charge, context.tool);

  const reserved = await remoteAccessStore.reserveCredits(accountId, {
    reservationId: getReservationId(context),
    credits: charge,
    tool: context.tool,
    metadata,
  });
  if (reserved) {
    return reserved;
  }

  const currentAccount = await remoteAccessStore.getAccount(accountId);
  assertPaidRemoteToolAllowed(currentAccount, charge, context.tool);

  throw new DiagnosticError({
    tool: context.tool,
    code: "CREDIT_RESERVATION_FAILED",
    stage: "unknown",
    message: "Unable to reserve credits for this operation right now.",
    retryable: true,
  });
}

async function runReservedCharge<T>(params: {
  accountId: string;
  charge: number;
  remoteAccessStore: RemoteAccessStore;
  usageEventStore: UsageEventStore;
  context: AnalysisExecutionContext;
  reservationMetadata: Record<string, unknown>;
  completedKind: UsageEventKind;
  run: () => Promise<T>;
  getCompletionMetadata: (result: T) => Record<string, unknown>;
}): Promise<T> {
  await params.context.reportProgress?.({
    progress: 2,
    total: 5,
    message: "Checking your credits.",
  });

  const reserved = await reserveCreditsOrThrow(
    params.remoteAccessStore,
    params.accountId,
    params.charge,
    params.context,
    params.reservationMetadata
  );

  if (reserved.changed) {
    await appendUsageEventSafe(params.usageEventStore, params.context, {
      accountId: params.accountId,
      kind: "credits.reserved",
      tool: params.context.tool,
      creditsDelta: -params.charge,
      creditsBalance: reserved.account.creditBalance,
      metadata: {
        ...params.reservationMetadata,
        reservationId: reserved.reservation.reservationId,
        chargeCredits: params.charge,
      },
    });
  }

  try {
    const result = await params.run();

    await params.context.reportProgress?.({
      progress: 5,
      total: 5,
      message: "Updating your account and finishing up.",
    });

    await appendUsageEventSafe(params.usageEventStore, params.context, {
      accountId: params.accountId,
      kind: params.completedKind,
      tool: params.context.tool,
      metadata: {
        ...params.getCompletionMetadata(result),
        chargeCredits: params.charge,
      },
    });

    const finalized = await params.remoteAccessStore.finalizeCreditReservation(
      params.accountId,
      reserved.reservation.reservationId
    );
    if (finalized?.changed) {
      await appendUsageEventSafe(params.usageEventStore, params.context, {
        accountId: params.accountId,
        kind: "credits.finalized",
        tool: params.context.tool,
        creditsDelta: 0,
        creditsBalance: finalized.account.creditBalance,
        metadata: {
          ...params.getCompletionMetadata(result),
          reservationId: finalized.reservation.reservationId,
          chargeCredits: params.charge,
        },
      });
    } else if (finalized === null) {
      params.context.logger.warn("remote.credits.finalize_failed_after_success", {
        accountId: params.accountId,
        charge: params.charge,
        tool: params.context.tool,
      });
      await appendUsageEventSafe(params.usageEventStore, params.context, {
        accountId: params.accountId,
        kind: "credits.finalize_failed",
        tool: params.context.tool,
        metadata: {
          ...params.getCompletionMetadata(result),
          reservationId: reserved.reservation.reservationId,
          chargeCredits: params.charge,
        },
      });
    }

    return result;
  } catch (error) {
    const released = await params.remoteAccessStore.releaseCreditReservation(
      params.accountId,
      reserved.reservation.reservationId
    );
    if (released?.changed) {
      await appendUsageEventSafe(params.usageEventStore, params.context, {
        accountId: params.accountId,
        kind: "credits.released",
        tool: params.context.tool,
        creditsDelta: params.charge,
        creditsBalance: released.account.creditBalance,
        metadata: {
          ...params.reservationMetadata,
          reservationId: released.reservation.reservationId,
          chargeCredits: params.charge,
        },
      });
    } else if (released === null) {
      params.context.logger.warn("remote.credits.release_failed_after_error", {
        accountId: params.accountId,
        charge: params.charge,
        tool: params.context.tool,
      });
      await appendUsageEventSafe(params.usageEventStore, params.context, {
        accountId: params.accountId,
        kind: "credits.release_failed",
        tool: params.context.tool,
        metadata: {
          ...params.reservationMetadata,
          reservationId: reserved.reservation.reservationId,
          chargeCredits: params.charge,
        },
      });
    }

    throw error;
  }
}

export function createPrincipalScopedService(
  service: VideoAnalysisServiceLike,
  principal: AuthPrincipal,
  remoteAccessStore: RemoteAccessStore,
  usageEventStore: UsageEventStore = createUsageEventStoreFromEnv()
): VideoAnalysisServiceLike {
  const accountId = getPrincipalKey(principal);

  return {
    async analyzeShort(input, context: AnalysisExecutionContext) {
      const charge = getShortAnalysisChargeCredits();
      return await runReservedCharge({
        accountId,
        charge,
        remoteAccessStore,
        usageEventStore,
        context,
        reservationMetadata: {
          youtubeUrl: input.youtubeUrl,
        },
        completedKind: "analysis.short.completed",
        run: () => service.analyzeShort(input, context),
        getCompletionMetadata: (result) => ({
          youtubeUrl: result.normalizedYoutubeUrl,
        }),
      });
    },

    async analyzeAudio(input, context: AnalysisExecutionContext) {
      const charge = getAudioAnalysisChargeCredits();
      return await runReservedCharge({
        accountId,
        charge,
        remoteAccessStore,
        usageEventStore,
        context,
        reservationMetadata: {
          youtubeUrl: input.youtubeUrl,
        },
        completedKind: "analysis.audio.completed",
        run: () => service.analyzeAudio(input, context),
        getCompletionMetadata: (result) => ({
          youtubeUrl: result.normalizedYoutubeUrl,
        }),
      });
    },

    analyzeLong: (input, context) => service.analyzeLong(input, context),
    continueLong: (input, context) => service.continueLong(input, context),
    getYouTubeMetadata: (input, context) => service.getYouTubeMetadata(input, context),
  };
}
