import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createBullMqLongAnalysisJobsFromEnv } from "../app/bullmq-long-analysis-jobs.js";
import { createPublicRemoteVideoAnalysisService } from "../app/create-public-remote-service.js";
import type { LongAnalysisJobs } from "../app/long-analysis-jobs.js";
import { createPrincipalScopedLongAnalysisJobs } from "../app/principal-scoped-long-analysis-jobs.js";
import { createPrincipalScopedService } from "../app/principal-scoped-service.js";
import type { VideoAnalysisServiceLike } from "../app/video-analysis-service.js";
import type { AuthPrincipal } from "../lib/auth/principal.js";
import { createServer } from "../server.js";

export type McpHttpHandlerOptions = {
  service?: VideoAnalysisServiceLike;
  createService?: () => VideoAnalysisServiceLike | Promise<VideoAnalysisServiceLike>;
  longAnalysisJobs?: LongAnalysisJobs | null;
};

export type McpHttpRequestContext = {
  principal?: AuthPrincipal | null;
};

export function createMcpHttpHandler(options: McpHttpHandlerOptions = {}) {
  const baseLongAnalysisJobs = options.longAnalysisJobs ?? createBullMqLongAnalysisJobsFromEnv();

  return async function handleMcpHttpRequest(
    request: Request,
    context: McpHttpRequestContext = {}
  ): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const baseService = options.service ?? (await options.createService?.()) ?? createPublicRemoteVideoAnalysisService();
    const service = context.principal ? createPrincipalScopedService(baseService, context.principal) : baseService;
    const longAnalysisJobs =
      context.principal && baseLongAnalysisJobs
        ? createPrincipalScopedLongAnalysisJobs(baseLongAnalysisJobs, context.principal)
        : baseLongAnalysisJobs;
    const server = createServer({
      service,
      runtimeMode: "cloud",
      longAnalysisJobs,
    });

    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } finally {
      await server.close();
      await transport.close();
    }
  };
}

export const handleMcpHttpRequest = createMcpHttpHandler();
