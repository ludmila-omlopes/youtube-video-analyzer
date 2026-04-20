import type { GetLongAnalysisJobToolOutput } from "@ludylops/video-analysis-core";
import type { RemoteAccessStore } from "./remote-access-store.js";
import type { UsageEventStore } from "./usage-events.js";

export async function settleLongJobCreditReservation(
  jobId: string,
  status: GetLongAnalysisJobToolOutput["status"],
  remoteAccessStore: RemoteAccessStore,
  usageEventStore: UsageEventStore
): Promise<void> {
  if (status !== "completed" && status !== "failed" && status !== "not_found") {
    return;
  }

  const [accountId, reservationId] = await Promise.all([
    remoteAccessStore.getJobOwner(jobId),
    remoteAccessStore.getJobCreditReservation(jobId),
  ]);
  if (!accountId || !reservationId) {
    return;
  }

  if (status === "completed") {
    const finalized = await remoteAccessStore.finalizeCreditReservation(accountId, reservationId);
    if (finalized?.changed) {
      await usageEventStore.append({
        accountId,
        kind: "credits.finalized",
        tool: "start_long_youtube_video_analysis",
        creditsDelta: 0,
        creditsBalance: finalized.account.creditBalance,
        metadata: {
          jobId,
          reservationId,
          chargeCredits: finalized.reservation.credits,
        },
      });
    }
  } else {
    const released = await remoteAccessStore.releaseCreditReservation(accountId, reservationId);
    if (released?.changed) {
      await usageEventStore.append({
        accountId,
        kind: "credits.released",
        tool: "start_long_youtube_video_analysis",
        creditsDelta: released.reservation.credits,
        creditsBalance: released.account.creditBalance,
        metadata: {
          jobId,
          reservationId,
          chargeCredits: released.reservation.credits,
          finalStatus: status,
        },
      });
    }
  }

  await remoteAccessStore.deleteJobCreditReservation?.(jobId);
}
