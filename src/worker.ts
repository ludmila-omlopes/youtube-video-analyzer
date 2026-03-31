import "dotenv/config";

import { createBullMqLongAnalysisWorker } from "./app/bullmq-long-analysis-jobs.js";

async function main(): Promise<void> {
  const worker = createBullMqLongAnalysisWorker();

  worker.on("completed", (job) => {
    console.log(`Long-analysis job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
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
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
