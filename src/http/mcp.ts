import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import {
  createPrincipalScopedLongAnalysisJobs,
  createPrincipalScopedService,
  createPrincipalScopedSessionStore,
  createRemoteAccessStoreFromEnv,
  type AuthPrincipal,
  type RemoteAccessStore,
} from "../auth-billing/index.js";
import {
  createBullMqLongAnalysisJobsFromEnv,
  createCloudSessionStore,
  createPublicRemoteVideoAnalysisService,
  type AnalysisSessionStore,
  type LongAnalysisJobs,
} from "../platform-runtime/index.js";
import type { VideoAnalysisServiceLike } from "../youtube-core/index.js";
import { createServer } from "../server.js";

export type McpHttpHandlerOptions = {
  service?: VideoAnalysisServiceLike;
  createService?: () => VideoAnalysisServiceLike | Promise<VideoAnalysisServiceLike>;
  longAnalysisJobs?: LongAnalysisJobs | null;
  sessionStore?: AnalysisSessionStore;
  remoteAccessStore?: RemoteAccessStore;
};

export type McpHttpRequestContext = {
  principal?: AuthPrincipal | null;
};

export function createMcpHttpHandler(options: McpHttpHandlerOptions = {}) {
  const baseLongAnalysisJobs = options.longAnalysisJobs ?? createBullMqLongAnalysisJobsFromEnv();
  const baseSessionStore = options.sessionStore ?? createCloudSessionStore();
  const remoteAccessStore = options.remoteAccessStore ?? createRemoteAccessStoreFromEnv();

  return async function handleMcpHttpRequest(
    request: Request,
    context: McpHttpRequestContext = {}
  ): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    if (context.principal) {
      await remoteAccessStore.upsertAccount(context.principal);
    }

    const baseService =
      options.service ??
      (await options.createService?.()) ??
      createPublicRemoteVideoAnalysisService({
        sessionStore: context.principal
          ? createPrincipalScopedSessionStore(baseSessionStore, context.principal, remoteAccessStore)
          : baseSessionStore,
      });
    const service = context.principal
      ? createPrincipalScopedService(baseService, context.principal, remoteAccessStore)
      : baseService;
    const longAnalysisJobs =
      context.principal && baseLongAnalysisJobs
        ? createPrincipalScopedLongAnalysisJobs(baseLongAnalysisJobs, context.principal, remoteAccessStore)
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
