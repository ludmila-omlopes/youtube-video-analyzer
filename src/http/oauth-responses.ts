import type { EnabledOAuthConfig } from "../lib/auth/config.js";
import {
  buildProtectedResourceMetadata,
  getOAuthProtectedResourceMetadataUrl,
} from "../lib/auth/protected-resource-metadata.js";
import type { AccessTokenValidationError } from "../lib/auth/validate-access-token.js";

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getBearerAuthError(error: AccessTokenValidationError): {
  status: 401 | 403;
  error: "invalid_token" | "insufficient_scope";
} {
  if (error.code === "TOKEN_SCOPE_MISSING") {
    return { status: 403, error: "insufficient_scope" };
  }

  return { status: 401, error: "invalid_token" };
}

export function createAuthFailureMcpResponse(
  request: Request,
  config: EnabledOAuthConfig,
  error: AccessTokenValidationError
): Response {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(request);
  const authError = getBearerAuthError(error);
  const params = [
    `realm="${escapeHeaderValue(config.resourceName)}"`,
    `resource_metadata="${escapeHeaderValue(resourceMetadataUrl)}"`,
    `error="${authError.error}"`,
    `error_description="${escapeHeaderValue(error.message)}"`,
  ];

  if (authError.error === "insufficient_scope" && config.requiredScope) {
    params.push(`scope="${escapeHeaderValue(config.requiredScope)}"`);
  }

  return new Response(
    JSON.stringify({
      error: authError.error,
      error_description: error.message,
      resourceMetadataUrl,
    }),
    {
      status: authError.status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        pragma: "no-cache",
        "www-authenticate": `Bearer ${params.join(", ")}`,
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
