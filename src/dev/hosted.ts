import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createHostedDevServer,
  getHostedServerConfig,
  getPublicOriginFromHeaders,
  main,
  resolveRoute,
} from "../hosted-dev-main.js";

export { createHostedDevServer, getHostedServerConfig, getPublicOriginFromHeaders, resolveRoute };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}