import assert from "node:assert/strict";

import {
  getHostedAccessPolicy,
  InMemoryApiKeyStore,
} from "../auth-billing/index.js";
import type { EnabledOAuthConfig, OAuthConfig } from "../lib/auth/config.js";
import type { AuthPrincipal } from "../lib/auth/principal.js";
import { getOAuthProtectedResourceMetadataUrl } from "../lib/auth/protected-resource-metadata.js";
import { AccessTokenValidationError } from "../lib/auth/validate-access-token.js";
import { authenticateWebRequest } from "../http/web-auth.js";

const enabledConfig: EnabledOAuthConfig = {
  enabled: true,
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-video-analyzer.onrender.com/",
  jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
  requiredScope: "mcp:access",
  resourceName: "youtube-video-analyzer",
  clockToleranceSeconds: 5,
};

const disabledConfig: OAuthConfig = {
  enabled: false,
  issuer: null,
  audience: null,
  jwksUrl: null,
  requiredScope: null,
  resourceName: "youtube-video-analyzer",
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
  const request = new Request("https://youtube-video-analyzer.onrender.com/api/v1/analyze/short?foo=bar");
  const protectedPolicy = getHostedAccessPolicy({
    oauthConfig: enabledConfig,
    allowUnauthenticatedHostedDev: false,
  });

  assert.equal(
    getOAuthProtectedResourceMetadataUrl(request),
    "https://youtube-video-analyzer.onrender.com/.well-known/oauth-protected-resource"
  );

  const disabledAuth = await authenticateWebRequest(request, {
    config: disabledConfig,
    policy: getHostedAccessPolicy({
      oauthConfig: disabledConfig,
      allowUnauthenticatedHostedDev: true,
    }),
  });
  assert.equal(disabledAuth.ok, true);
  if (disabledAuth.ok) {
    assert.equal(disabledAuth.authMode, "local");
    assert.equal(disabledAuth.principal.subject, "local-browser-user");
  }

  const protectedMisconfigured = await authenticateWebRequest(request, {
    config: disabledConfig,
    policy: getHostedAccessPolicy({
      oauthConfig: disabledConfig,
      allowUnauthenticatedHostedDev: false,
    }),
  });
  assert.equal(protectedMisconfigured.ok, false);
  if (!protectedMisconfigured.ok) {
    const protectedPayload = (await protectedMisconfigured.response.json()) as {
      error: { code: string; message: string };
    };
    assert.equal(protectedMisconfigured.response.status, 503);
    assert.equal(protectedPayload.error.code, "HOSTED_AUTH_CONFIGURATION_INVALID");
    assert.match(protectedPayload.error.message, /Hosted HTTP auth is protected by default/);
  }

  const apiKeyStore = new InMemoryApiKeyStore();
  const createdApiKey = await apiKeyStore.createApiKey(principal, "API key");
  const apiKeyAuthenticated = await authenticateWebRequest(
    new Request("https://youtube-video-analyzer.onrender.com/api/v1/analyze/short", {
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
    assert.equal(apiKeyAuthenticated.principal.subject, principal.subject);
    assert.equal(apiKeyAuthenticated.principal.rawClaims.authMethod, "api_key");
    assert.deepEqual(apiKeyAuthenticated.principal.audience, ["youtube-video-analyzer-web", "youtube-video-analyzer"]);
  }

  const missingToken = await authenticateWebRequest(request, {
    config: enabledConfig,
    policy: protectedPolicy,
  });
  assert.equal(missingToken.ok, false);
  if (!missingToken.ok) {
    const payload = (await missingToken.response.json()) as {
      error: { code: string; message: string };
      auth: { required: boolean; mode: string; protectedResourceMetadataUrl: string };
    };

    assert.equal(missingToken.response.status, 401);
    assert.equal(payload.error.code, "TOKEN_MISSING");
    assert.equal(payload.auth.protectedResourceMetadataUrl, "https://youtube-video-analyzer.onrender.com/.well-known/oauth-protected-resource");
  }

  const insufficientScope = await authenticateWebRequest(
    new Request("https://youtube-video-analyzer.onrender.com/api/v1/analyze/short", {
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
    assert.equal(insufficientScope.response.status, 401);
    const body = (await insufficientScope.response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "TOKEN_SCOPE_MISSING");
  }

  const authenticated = await authenticateWebRequest(
    new Request("https://youtube-video-analyzer.onrender.com/api/v1/analyze/short", {
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
