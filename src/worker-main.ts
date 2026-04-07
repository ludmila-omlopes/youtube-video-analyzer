import "dotenv/config";

import {
  createRemoteAccessStoreFromEnv,
  createUsageEventStoreFromEnv,
  settleLongJobCreditReservation,
} from "./auth-billing/index.js";
import { createBullMqLongAnalysisWorker } from "./app/bullmq-long-analysis-jobs.js";
import {
  assertHostedRuntimeReady,
  getHostedRuntimeStartupSummary,
} from "./platform-runtime/index.js";

export async function main(): Promise<void> {
  const hostedRuntimeRole = assertHostedRuntimeReady();
  const worker = createBullMqLongAnalysisWorker();
  const remoteAccessStore = createRemoteAccessStoreFromEnv();
  const usageEventStore = createUsageEventStoreFromEnv();

  worker.on("completed", (job) => {
    if (job.id) {
      void settleLongJobCreditReservation(String(job.id), "completed", remoteAccessStore, usageEventStore);
    }
    console.log(`Long-analysis job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    if (job?.id) {
      void settleLongJobCreditReservation(String(job.id), "failed", remoteAccessStore, usageEventStore);
    }
    console.error(`Long-analysis job failed: ${job?.id ?? "unknown"}`);
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  });

  worker.on("error", (error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}, closing long-analysis worker`);
    await worker.close();
    process.exit();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await worker.waitUntilReady();
  console.log("Long-analysis worker is ready");
  if (hostedRuntimeRole) {
    for (const line of getHostedRuntimeStartupSummary()) {
      console.log(line);
    }
  }
}
