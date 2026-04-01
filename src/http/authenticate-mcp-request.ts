import type { AuthPrincipal } from "../lib/auth/principal.js";
import { getOAuthConfig, type OAuthConfig } from "../lib/auth/config.js";
import { AccessTokenValidationError, validateAccessToken } from "../lib/auth/validate-access-token.js";

import { createAuthFailureMcpResponse } from "./oauth-responses.js";

export type AuthenticatedMcpRequest =
  | {
      ok: true;
      principal: AuthPrincipal | null;
    }
  | {
      ok: false;
      response: Response;
    };

export type AuthenticateMcpRequestOptions = {
  config?: OAuthConfig;
  validateBearerToken?: typeof validateAccessToken;
};

export async function authenticateMcpRequest(
  request: Request,
  options: AuthenticateMcpRequestOptions = {}
): Promise<AuthenticatedMcpRequest> {
  const config = options.config ?? getOAuthConfig();
  if (!config.enabled) {
    return { ok: true, principal: null };
  }

  try {
    const principal = await (options.validateBearerToken ?? validateAccessToken)(
      request.headers.get("authorization"),
      config
    );
    return { ok: true, principal };
  } catch (error) {
    if (error instanceof AccessTokenValidationError) {
      return {
        ok: false,
        response: createAuthFailureMcpResponse(request, config, error),
      };
    }

    throw error;
  }
}
