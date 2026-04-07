import assert from "node:assert/strict";

import { getBrowserOAuthClientConfig } from "../auth-billing/index.js";
import { resolveBrowserSigninPayload } from "../http/web-auth.js";

export async function run(): Promise<void> {
  const disabled = getBrowserOAuthClientConfig({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.reason, "not_configured");
  assert.equal(disabled.redirectPath, "/app");

  const incomplete = getBrowserOAuthClientConfig({
    OAUTH_WEB_CLIENT_ID: "client-1",
    OAUTH_WEB_AUTHORIZATION_URL: "https://issuer.example.com/authorize",
  });
  assert.equal(incomplete.enabled, false);
  assert.equal(incomplete.reason, "incomplete_config");

  const enabled = getBrowserOAuthClientConfig({
    OAUTH_WEB_CLIENT_ID: "client-1",
    OAUTH_WEB_AUTHORIZATION_URL: "https://issuer.example.com/authorize",
    OAUTH_WEB_TOKEN_URL: "https://issuer.example.com/oauth/token",
    OAUTH_WEB_REDIRECT_PATH: "/app/oauth/callback",
    OAUTH_WEB_SCOPES: "openid profile mcp:access",
    OAUTH_WEB_AUDIENCE: "https://youtube-analyzer.onrender.com/api/mcp",
    OAUTH_WEB_RESOURCE: "https://youtube-analyzer.onrender.com/api/mcp",
  });

  assert.equal(enabled.enabled, true);
  if (!enabled.enabled) {
    throw new Error("Expected enabled browser OAuth config.");
  }

  assert.equal(enabled.clientId, "client-1");
  assert.equal(enabled.redirectPath, "/app/oauth/callback");
  assert.deepEqual(enabled.scopes, ["openid", "profile", "mcp:access"]);

  const payload = resolveBrowserSigninPayload(
    new Request("https://youtube-analyzer.onrender.com/app"),
    enabled
  );
  assert.deepEqual(payload, {
    enabled: true,
    reason: null,
    authorizationUrl: "https://issuer.example.com/authorize",
    tokenUrl: "https://issuer.example.com/oauth/token",
    clientId: "client-1",
    redirectUrl: "https://youtube-analyzer.onrender.com/app/oauth/callback",
    scopes: ["openid", "profile", "mcp:access"],
    audience: "https://youtube-analyzer.onrender.com/api/mcp",
    resource: "https://youtube-analyzer.onrender.com/api/mcp",
  });
}
