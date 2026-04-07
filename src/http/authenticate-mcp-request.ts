import {
  AccessTokenValidationError,
  createApiKeyStoreFromEnv,
  getHostedAccessPolicy,
  getApiKeyFromRequest,
  type ApiKeyStore,
  type HostedAccessPolicy,
  type AuthPrincipal,
  type OAuthConfig,
  validateAccessToken,
} from "../auth-billing/index.js";

import {
  createAuthFailureMcpResponse,
  createHostedAuthConfigurationErrorMcpResponse,
} from "./oauth-responses.js";

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
  apiKeyStore?: ApiKeyStore;
  config?: OAuthConfig;
  policy?: HostedAccessPolicy;
  validateBearerToken?: typeof validateAccessToken;
};

export async function authenticateMcpRequest(
  request: Request,
  options: AuthenticateMcpRequestOptions = {}
): Promise<AuthenticatedMcpRequest> {
  const policy = options.policy ?? getHostedAccessPolicy({ oauthConfig: options.config });

  if (policy.allowUnauthenticatedHostedAccess) {
    return { ok: true, principal: null };
  }

  if (!policy.hostedAuthConfigured || !policy.oauthConfig.enabled) {
    return {
      ok: false,
      response: createHostedAuthConfigurationErrorMcpResponse(
        request,
        policy.oauthConfig.resourceName,
        policy.configurationError ?? "Hosted auth configuration is invalid."
      ),
    };
  }

  const config = policy.oauthConfig;
  const rawApiKey = getApiKeyFromRequest(request);
  if (rawApiKey) {
    const apiKeyStore = options.apiKeyStore ?? createApiKeyStoreFromEnv();
    const authenticatedApiKey = await apiKeyStore.authenticateApiKey(rawApiKey);
    if (authenticatedApiKey) {
      return {
        ok: true,
        principal: authenticatedApiKey.principal,
      };
    }
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
