import type { EnabledOAuthConfig } from "../lib/auth/config.js";
import {
  buildProtectedResourceMetadata,
  getOAuthProtectedResourceMetadataUrl,
} from "../lib/auth/protected-resource-metadata.js";
export function createHostedAuthConfigurationErrorMcpResponse(
  request: Request,
  resourceName: string,
  message: string
): Response {
  return new Response(
    JSON.stringify({
      error: "server_configuration_error",
      error_description: message,
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(request),
      resourceName,
    }),
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    }
  );
}

export function createProtectedResourceMetadataResponse(config: EnabledOAuthConfig): Response {
  return new Response(JSON.stringify(buildProtectedResourceMetadata(config)), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      pragma: "no-cache",
    },
  });
}
