import { getHostedAccessPolicy } from "../auth-billing/index.js";

import {
  createHostedAuthConfigurationErrorMcpResponse,
  createProtectedResourceMetadataResponse,
} from "./oauth-responses.js";

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function handleProtectedResourceMetadataRequest(_request: Request): Promise<Response> {
  const policy = getHostedAccessPolicy();

  if (policy.allowUnauthenticatedHostedAccess) {
    return notFound();
  }

  if (!policy.hostedAuthConfigured || !policy.oauthConfig.enabled) {
    return createHostedAuthConfigurationErrorMcpResponse(
      _request,
      policy.oauthConfig.resourceName,
      policy.configurationError ?? "Hosted auth configuration is invalid."
    );
  }

  return createProtectedResourceMetadataResponse(policy.oauthConfig);
}
