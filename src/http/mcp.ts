import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createPublicRemoteVideoAnalysisService } from "../app/create-public-remote-service.js";
import type { VideoAnalysisServiceLike } from "../app/video-analysis-service.js";
import { createServer } from "../server.js";

export type McpHttpHandlerOptions = {
  service?: VideoAnalysisServiceLike;
  createService?: () => VideoAnalysisServiceLike | Promise<VideoAnalysisServiceLike>;
};

export function createMcpHttpHandler(options: McpHttpHandlerOptions = {}) {
  return async function handleMcpHttpRequest(request: Request): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createServer({
      service: options.service ?? (await options.createService?.()) ?? createPublicRemoteVideoAnalysisService(),
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
