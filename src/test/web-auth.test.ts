import assert from "node:assert/strict";

import {
  AccessTokenValidationError,
  getHostedAccessPolicy,
  getOAuthConfig,
  InMemoryApiKeyStore,
  type AuthPrincipal,
  type EnabledOAuthConfig,
} from "../auth-billing/index.js";
import { authenticateWebRequest } from "../http/web-auth.js";

const enabledConfig: EnabledOAuthConfig = {
  enabled: true,
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer.onrender.com/api/mcp",
  jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
  requiredScope: "mcp:access",
  resourceName: "youtube-video-analyzer-mcp",
  clockToleranceSeconds: 5,
};

const principal: AuthPrincipal = {
  subject: "user-1",
  issuer: enabledConfig.issuer,
  audience: enabledConfig.audience,
  scope: ["mcp:access"],
  tokenId: null,
  rawClaims: {},
};

const disabledConfig = getOAuthConfig({ OAUTH_ENABLED: "false" });

const BROWSER_OAUTH_ENV_KEYS = [
  "OAUTH_WEB_CLIENT_ID",
  "OAUTH_WEB_AUTHORIZATION_URL",
  "OAUTH_WEB_TOKEN_URL",
  "OAUTH_WEB_REDIRECT_PATH",
  "OAUTH_WEB_SCOPES",
  "OAUTH_WEB_AUDIENCE",
  "OAUTH_WEB_RESOURCE",
] as const;

async function withEnvCleared(
  keys: readonly string[],
  runWithEnv: () => Promise<void>
): Promise<void> {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      delete process.env[key];
    }
    await runWithEnv();
  } finally {
    for (const key of keys) {
      const next = previous[key];
      if (next === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = next;
      }
    }
  }
}

export async function run(): Promise<void> {
  await withEnvCleared(BROWSER_OAUTH_ENV_KEYS, async () => {
    const protectedPolicy = getHostedAccessPolicy({
      oauthConfig: enabledConfig,
      allowUnauthenticatedHostedDev: false,
    });
    const apiKeyStore = new InMemoryApiKeyStore();
    const created = await apiKeyStore.createApiKey(principal, "Script key");

    const apiKeyRequest = await authenticateWebRequest(
      new Request("https://youtube-analyzer.onrender.com/api/web/session", {
        headers: { "x-api-key": created.plaintextKey },
      }),
      {
        config: enabledConfig,
        policy: protectedPolicy,
        apiKeyStore,
      }
    );

    assert.equal(apiKeyRequest.ok, true);
    if (!apiKeyRequest.ok) {
      throw new Error("Expected API key auth to succeed.");
    }
    assert.equal(apiKeyRequest.authMode, "api_key");
    assert.equal(apiKeyRequest.principal.subject, principal.subject);

    const bearerRequest = await authenticateWebRequest(
      new Request("https://youtube-analyzer.onrender.com/api/web/session", {
        headers: { authorization: "Bearer token-1" },
      }),
      {
        config: enabledConfig,
        policy: protectedPolicy,
        validateBearerToken: async () => principal,
      }
    );
    assert.equal(bearerRequest.ok, true);
    if (!bearerRequest.ok) {
      throw new Error("Expected bearer auth to succeed.");
    }
    assert.equal(bearerRequest.authMode, "oauth");

    const failedRequest = await authenticateWebRequest(
      new Request("https://youtube-analyzer.onrender.com/api/web/session"),
      {
        config: enabledConfig,
        policy: protectedPolicy,
        validateBearerToken: async () => {
          throw new AccessTokenValidationError("Missing bearer access token.", "TOKEN_MISSING");
        },
      }
    );

    assert.equal(failedRequest.ok, false);
    if (failedRequest.ok) {
      throw new Error("Expected auth failure.");
    }

    const payload = (await failedRequest.response.json()) as {
      auth: {
        required: boolean;
        browserSignin: { enabled: boolean; reason: string | null };
      };
      error: { code: string };
    };
    assert.equal(failedRequest.response.status, 401);
    assert.equal(payload.auth.required, true);
    assert.equal(payload.error.code, "TOKEN_MISSING");
    assert.equal(payload.auth.browserSignin.enabled, false);

    const protectedMisconfigured = await authenticateWebRequest(
      new Request("https://youtube-analyzer.onrender.com/api/web/session"),
      {
        config: disabledConfig,
        policy: getHostedAccessPolicy({
          oauthConfig: disabledConfig,
          allowUnauthenticatedHostedDev: false,
        }),
      }
    );
    assert.equal(protectedMisconfigured.ok, false);
    if (!protectedMisconfigured.ok) {
      const protectedPayload = (await protectedMisconfigured.response.json()) as {
        auth: { configured: boolean };
        error: { code: string; message: string };
      };
      assert.equal(protectedMisconfigured.response.status, 503);
      assert.equal(protectedPayload.auth.configured, false);
      assert.equal(protectedPayload.error.code, "HOSTED_AUTH_CONFIGURATION_INVALID");
      assert.match(protectedPayload.error.message, /Hosted HTTP auth is protected by default/);
    }

    const localRequest = await authenticateWebRequest(
      new Request("https://youtube-analyzer.onrender.com/api/web/session"),
      {
        config: disabledConfig,
        policy: getHostedAccessPolicy({
          oauthConfig: disabledConfig,
          allowUnauthenticatedHostedDev: true,
        }),
      }
    );
    assert.equal(localRequest.ok, true);
    if (!localRequest.ok) {
      throw new Error("Expected local mode auth.");
    }
    assert.equal(localRequest.authMode, "local");
  });
}
