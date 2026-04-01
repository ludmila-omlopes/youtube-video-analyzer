import assert from "node:assert/strict";

import type { EnabledOAuthConfig } from "../lib/auth/config.js";
import {
  AccessTokenValidationError,
  validateAccessToken,
} from "../lib/auth/validate-access-token.js";

const oauthConfig: EnabledOAuthConfig = {
  enabled: true,
  issuer: "https://issuer.example.com/",
  audience: "https://youtube-analyzer.onrender.com/api/mcp",
  jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
  requiredScope: "mcp:access",
  resourceName: "youtube-video-analyzer-mcp",
  clockToleranceSeconds: 5,
};

export async function run(): Promise<void> {
  const stringScopePrincipal = await validateAccessToken("Bearer token-1", oauthConfig, {
    verifyPayload: async (token) => {
      assert.equal(token, "token-1");
      return {
        sub: "user-1",
        iss: oauthConfig.issuer,
        aud: oauthConfig.audience,
        scope: "mcp:access paid",
        jti: "token-id-1",
      };
    },
  });

  assert.equal(stringScopePrincipal.subject, "user-1");
  assert.equal(stringScopePrincipal.issuer, oauthConfig.issuer);
  assert.equal(stringScopePrincipal.audience, oauthConfig.audience);
  assert.deepEqual(stringScopePrincipal.scope, ["mcp:access", "paid"]);
  assert.equal(stringScopePrincipal.tokenId, "token-id-1");
  assert.equal(stringScopePrincipal.rawClaims.sub, "user-1");

  const arrayScopePrincipal = await validateAccessToken("Bearer token-2", oauthConfig, {
    verifyPayload: async () => ({
      sub: "user-2",
      iss: oauthConfig.issuer,
      aud: oauthConfig.audience,
      scp: ["mcp:access", "team"],
    }),
  });

  assert.equal(arrayScopePrincipal.subject, "user-2");
  assert.deepEqual(arrayScopePrincipal.scope, ["mcp:access", "team"]);

  await assert.rejects(
    () => validateAccessToken(null, oauthConfig),
    (error: unknown) => {
      assert.equal(error instanceof AccessTokenValidationError, true);
      assert.equal((error as AccessTokenValidationError).code, "TOKEN_MISSING");
      return true;
    }
  );

  await assert.rejects(
    () =>
      validateAccessToken("Bearer token-3", oauthConfig, {
        verifyPayload: async () => ({
          sub: "user-3",
          iss: oauthConfig.issuer,
          aud: oauthConfig.audience,
          scope: "paid",
        }),
      }),
    (error: unknown) => {
      assert.equal(error instanceof AccessTokenValidationError, true);
      assert.equal((error as AccessTokenValidationError).code, "TOKEN_SCOPE_MISSING");
      return true;
    }
  );

  await assert.rejects(
    () =>
      validateAccessToken("Bearer token-4", oauthConfig, {
        verifyPayload: async () => ({
          iss: oauthConfig.issuer,
          aud: oauthConfig.audience,
          scope: "mcp:access",
        }),
      }),
    (error: unknown) => {
      assert.equal(error instanceof AccessTokenValidationError, true);
      assert.equal((error as AccessTokenValidationError).code, "TOKEN_INVALID");
      return true;
    }
  );
}
