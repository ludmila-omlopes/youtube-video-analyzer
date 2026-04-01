import { getOAuthConfig } from "../lib/auth/config.js";

import { createProtectedResourceMetadataResponse } from "./oauth-responses.js";

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function handleProtectedResourceMetadataRequest(_request: Request): Promise<Response> {
  const config = getOAuthConfig();
  if (!config.enabled) {
    return notFound();
  }

  return createProtectedResourceMetadataResponse(config);
}
