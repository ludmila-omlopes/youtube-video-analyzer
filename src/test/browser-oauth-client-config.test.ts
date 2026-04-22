import assert from "node:assert/strict";

import { getBrowserOAuthClientConfig } from "../auth-billing/index.js";
import { resolveBrowserSigninPayload } from "../http/web-auth.js";

export async function run(): Promise<void> {
  const disabled = getBrowserOAuthClientConfig({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.reason, "not_configured");
  assert.equal(disabled.redirectPath, "/oauth/callback");

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
    OAUTH_WEB_AUDIENCE: "https://youtube-video-analyzer.onrender.com/",
    OAUTH_WEB_RESOURCE: "https://youtube-video-analyzer.onrender.com/",
  });

  assert.equal(enabled.enabled, true);
  if (!enabled.enabled) {
    throw new Error("Expected enabled browser OAuth config.");
  }

  assert.equal(enabled.clientId, "client-1");
  assert.equal(enabled.redirectPath, "/app/oauth/callback");
  assert.deepEqual(enabled.scopes, ["openid", "profile", "mcp:access"]);

  const payload = resolveBrowserSigninPayload(
    new Request("https://youtube-video-analyzer.onrender.com/app"),
    enabled
  );
  assert.deepEqual(payload, {
    enabled: true,
    reason: null,
    authorizationUrl: "https://issuer.example.com/authorize",
    tokenUrl: "https://issuer.example.com/oauth/token",
    clientId: "client-1",
    redirectUrl: "https://youtube-video-analyzer.onrender.com/app/oauth/callback",
    scopes: ["openid", "profile", "mcp:access"],
    audience: "https://youtube-video-analyzer.onrender.com/",
    resource: "https://youtube-video-analyzer.onrender.com/",
  });

  const audienceFromOAuthAudience = getBrowserOAuthClientConfig({
    OAUTH_WEB_CLIENT_ID: "client-1",
    OAUTH_WEB_AUTHORIZATION_URL: "https://issuer.example.com/authorize",
    OAUTH_WEB_TOKEN_URL: "https://issuer.example.com/oauth/token",
    OAUTH_AUDIENCE: "https://youtube-video-analyzer.onrender.com/",
  });
  assert.equal(audienceFromOAuthAudience.enabled, true);
  if (!audienceFromOAuthAudience.enabled) {
    throw new Error("Expected enabled browser OAuth config.");
  }
  assert.equal(audienceFromOAuthAudience.audience, "https://youtube-video-analyzer.onrender.com/");
  assert.equal(audienceFromOAuthAudience.resource, "https://youtube-video-analyzer.onrender.com/");

  const legacyAppRedirect = getBrowserOAuthClientConfig({
    OAUTH_WEB_CLIENT_ID: "client-1",
    OAUTH_WEB_AUTHORIZATION_URL: "https://issuer.example.com/authorize",
    OAUTH_WEB_TOKEN_URL: "https://issuer.example.com/oauth/token",
    OAUTH_WEB_REDIRECT_PATH: "/app",
  });
  assert.equal(legacyAppRedirect.enabled, true);
  if (!legacyAppRedirect.enabled) {
    throw new Error("Expected enabled browser OAuth config.");
  }
  assert.equal(legacyAppRedirect.redirectPath, "/oauth/callback");

  const badUrls = getBrowserOAuthClientConfig({
    OAUTH_WEB_CLIENT_ID: "client-1",
    OAUTH_WEB_AUTHORIZATION_URL: "not-a-valid-url",
    OAUTH_WEB_TOKEN_URL: "https://issuer.example.com/oauth/token",
  });
  assert.equal(badUrls.enabled, false);
  assert.equal(badUrls.reason, "incomplete_config");
}
