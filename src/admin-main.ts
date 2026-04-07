import "dotenv/config";

import type { Server } from "node:http";
import process from "node:process";

import { registerAdminAccountRoutes } from "./app/admin-account-routes.js";
import { createQueueDashboardApp } from "./app/queue-dashboard.js";
import { createRemoteAccessStoreFromEnv, createUsageEventStoreFromEnv } from "./auth-billing/index.js";
import {
  assertHostedRuntimeReady,
  getHostedRuntimeStartupSummary,
} from "./platform-runtime/index.js";

export async function main(): Promise<void> {
  const hostedRuntimeRole = assertHostedRuntimeReady();
  const dashboard = createQueueDashboardApp();
  registerAdminAccountRoutes(dashboard.app, {
    remoteAccessStore: createRemoteAccessStoreFromEnv(),
    usageEventStore: createUsageEventStoreFromEnv(),
  });

  const server = await new Promise<Server>((resolve) => {
    const listeningServer = dashboard.app.listen(dashboard.config.port, dashboard.config.host, () => {
      console.log(`BullMQ dashboard listening on http://${dashboard.config.host}:${dashboard.config.port}`);
      console.log(`Queues: ${dashboard.queueNames.join(", ")}`);
      if (hostedRuntimeRole) {
        for (const line of getHostedRuntimeStartupSummary()) {
          console.log(line);
        }
      }
      resolve(listeningServer);
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}, closing BullMQ dashboard`);
    server.close(async (error) => {
      try {
        await dashboard.close();
      } catch (closeError) {
        console.error(closeError instanceof Error ? closeError.stack || closeError.message : String(closeError));
      }

      if (error) {
        console.error(error);
        process.exitCode = 1;
      }

      process.exit();
    });
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
