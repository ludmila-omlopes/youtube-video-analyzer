import assert from "node:assert/strict";

import {
  getHostedAccessPolicy,
  InMemoryApiKeyStore,
} from "../auth-billing/index.js";
import type { EnabledOAuthConfig, OAuthConfig } from "../lib/auth/config.js";
import type { AuthPrincipal } from "../lib/auth/principal.js";
import { getOAuthProtectedResourceMetadataUrl } from "../lib/auth/protected-resource-metadata.js";
import { AccessTokenValidationError } from "../lib/auth/validate-access-token.js";
import { authenticateMcpRequest } from "../http/authenticate-mcp-request.js";

const enabledConfig: EnabledOAuthConfig = {
  enabled: true,
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer.onrender.com/api/mcp",
  jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
  requiredScope: "mcp:access",
  resourceName: "youtube-video-analyzer-mcp",
  clockToleranceSeconds: 5,
};

const disabledConfig: OAuthConfig = {
  enabled: false,
  issuer: null,
  audience: null,
  jwksUrl: null,
  requiredScope: null,
  resourceName: "youtube-video-analyzer-mcp",
  clockToleranceSeconds: 5,
};

const principal: AuthPrincipal = {
  subject: "user-1",
  issuer: enabledConfig.issuer,
  audience: enabledConfig.audience,
  scope: ["mcp:access"],
  tokenId: "token-1",
  rawClaims: {
    sub: "user-1",
    iss: enabledConfig.issuer,
    aud: enabledConfig.audience,
    scope: "mcp:access",
    jti: "token-1",
  },
};

export async function run(): Promise<void> {
  const request = new Request("https://youtube-analyzer.onrender.com/api/mcp?foo=bar");
  const protectedPolicy = getHostedAccessPolicy({
    oauthConfig: enabledConfig,
    allowUnauthenticatedHostedDev: false,
  });

  assert.equal(
    getOAuthProtectedResourceMetadataUrl(request),
    "https://youtube-analyzer.onrender.com/.well-known/oauth-protected-resource"
  );

  const disabledAuth = await authenticateMcpRequest(request, {
    config: disabledConfig,
    policy: getHostedAccessPolicy({
      oauthConfig: disabledConfig,
      allowUnauthenticatedHostedDev: true,
    }),
  });
  assert.equal(disabledAuth.ok, true);
  if (disabledAuth.ok) {
    assert.equal(disabledAuth.principal, null);
  }

  const protectedMisconfigured = await authenticateMcpRequest(request, {
    config: disabledConfig,
    policy: getHostedAccessPolicy({
      oauthConfig: disabledConfig,
      allowUnauthenticatedHostedDev: false,
    }),
  });
  assert.equal(protectedMisconfigured.ok, false);
  if (!protectedMisconfigured.ok) {
    const protectedPayload = (await protectedMisconfigured.response.json()) as {
      error: string;
      error_description: string;
    };
    assert.equal(protectedMisconfigured.response.status, 503);
    assert.equal(protectedPayload.error, "server_configuration_error");
    assert.match(protectedPayload.error_description, /Hosted HTTP auth is protected by default/);
  }

  const apiKeyStore = new InMemoryApiKeyStore();
  const createdApiKey = await apiKeyStore.createApiKey(principal, "MCP key");
  const apiKeyAuthenticated = await authenticateMcpRequest(
    new Request("https://youtube-analyzer.onrender.com/api/mcp", {
      headers: { authorization: `ApiKey ${createdApiKey.plaintextKey}` },
    }),
    {
      config: enabledConfig,
      policy: protectedPolicy,
      apiKeyStore,
    }
  );
  assert.equal(apiKeyAuthenticated.ok, true);
  if (apiKeyAuthenticated.ok) {
    assert.equal(apiKeyAuthenticated.principal?.subject, principal.subject);
    assert.equal(apiKeyAuthenticated.principal?.rawClaims.authMethod, "api_key");
    assert.deepEqual(apiKeyAuthenticated.principal?.audience, [
      "youtube-analyzer-web",
      "youtube-analyzer-mcp",
    ]);
  }

  const missingToken = await authenticateMcpRequest(request, {
    config: enabledConfig,
    policy: protectedPolicy,
  });
  assert.equal(missingToken.ok, false);
  if (!missingToken.ok) {
    const payload = (await missingToken.response.json()) as {
      error: string;
      error_description: string;
      resourceMetadataUrl: string;
    };

    assert.equal(missingToken.response.status, 401);
    assert.equal(payload.error, "invalid_token");
    assert.equal(payload.resourceMetadataUrl, "https://youtube-analyzer.onrender.com/.well-known/oauth-protected-resource");
    assert.match(
      missingToken.response.headers.get("www-authenticate") ?? "",
      /resource_metadata="https:\/\/youtube-analyzer\.onrender\.com\/\.well-known\/oauth-protected-resource"/
    );
  }

  const insufficientScope = await authenticateMcpRequest(
    new Request("https://youtube-analyzer.onrender.com/api/mcp", {
      headers: { authorization: "Bearer token-2" },
    }),
    {
      config: enabledConfig,
      policy: protectedPolicy,
      validateBearerToken: async () => {
        throw new AccessTokenValidationError(
          `Access token is missing required scope "${enabledConfig.requiredScope}".`,
          "TOKEN_SCOPE_MISSING"
        );
      },
    }
  );
  assert.equal(insufficientScope.ok, false);
  if (!insufficientScope.ok) {
    assert.equal(insufficientScope.response.status, 403);
    assert.match(insufficientScope.response.headers.get("www-authenticate") ?? "", /scope="mcp:access"/);
  }

  const authenticated = await authenticateMcpRequest(
    new Request("https://youtube-analyzer.onrender.com/api/mcp", {
      headers: { authorization: "Bearer token-3" },
    }),
    {
      config: enabledConfig,
      policy: protectedPolicy,
      validateBearerToken: async (authorizationHeader, config) => {
        assert.equal(authorizationHeader, "Bearer token-3");
        assert.equal(config.audience, enabledConfig.audience);
        return principal;
      },
    }
  );

  assert.equal(authenticated.ok, true);
  if (authenticated.ok) {
    assert.deepEqual(authenticated.principal, principal);
  }
}
