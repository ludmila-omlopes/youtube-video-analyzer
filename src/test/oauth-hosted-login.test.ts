import assert from "node:assert/strict";

import type { EnabledBrowserOAuthClientConfig } from "../auth-billing/index.js";
import { __test, oauthCallbackPathMatches } from "../http/oauth-hosted-login.js";

const sampleConfig: EnabledBrowserOAuthClientConfig = {
  enabled: true,
  reason: null,
  authorizationUrl: "https://issuer.example.com/authorize",
  tokenUrl: "https://issuer.example.com/token",
  clientId: "cid",
  redirectPath: "/oauth/callback",
  scopes: ["openid", "mcp:access"],
  audience: "https://api.example/",
  resource: "https://api.example/",
};

export async function run(): Promise<void> {
  const verifier = "test-verifier";
  const challenge = __test.createPkceChallenge(verifier);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(challenge, verifier);

  const url = __test.buildAuthorizeUrl(
    new Request("https://service.example/foo"),
    sampleConfig,
    challenge,
    "st42"
  );
  assert.equal(url.origin + url.pathname, "https://issuer.example.com/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "https://service.example/oauth/callback");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "st42");
  assert.equal(url.searchParams.get("scope"), "openid mcp:access");
  assert.equal(url.searchParams.get("audience"), "https://api.example/");
  assert.equal(url.searchParams.get("resource"), "https://api.example/");

  assert.equal(__test.timingSafeEqualString("a", "a"), true);
  assert.equal(__test.timingSafeEqualString("a", "b"), false);
  assert.equal(__test.timingSafeEqualString("a", "aa"), false);

  assert.equal(oauthCallbackPathMatches("/oauth/callback"), true);
  assert.equal(oauthCallbackPathMatches("/oauth/callback/"), true);
  assert.equal(oauthCallbackPathMatches("/other"), false);

  const previous = process.env.OAUTH_WEB_REDIRECT_PATH;
  try {
    process.env.OAUTH_WEB_REDIRECT_PATH = "/custom/cb";
    assert.equal(oauthCallbackPathMatches("/custom/cb"), true);
    assert.equal(oauthCallbackPathMatches("/oauth/callback"), false);
  } finally {
    if (previous === undefined) {
      delete process.env.OAUTH_WEB_REDIRECT_PATH;
    } else {
      process.env.OAUTH_WEB_REDIRECT_PATH = previous;
    }
  }

  try {
    process.env.OAUTH_WEB_REDIRECT_PATH = "/app";
    assert.equal(oauthCallbackPathMatches("/oauth/callback"), true);
    assert.equal(oauthCallbackPathMatches("/app"), false);
  } finally {
    if (previous === undefined) {
      delete process.env.OAUTH_WEB_REDIRECT_PATH;
    } else {
      process.env.OAUTH_WEB_REDIRECT_PATH = previous;
    }
  }
}
