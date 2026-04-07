import type { EnabledOAuthConfig } from "./config.js";

export const OAUTH_PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

export type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ["header"];
  scopes_supported?: string[];
};

export function getOAuthProtectedResourceMetadataUrl(request: Request): string {
  const url = new URL(request.url);
  url.pathname = OAUTH_PROTECTED_RESOURCE_METADATA_PATH;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function buildProtectedResourceMetadata(config: EnabledOAuthConfig): ProtectedResourceMetadata {
  return {
    resource: config.audience,
    authorization_servers: [config.issuer],
    bearer_methods_supported: ["header"],
    ...(config.requiredScope ? { scopes_supported: [config.requiredScope] } : {}),
  };
}
