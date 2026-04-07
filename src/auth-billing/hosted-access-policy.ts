import process from "node:process";

import {
  createDisabledOAuthConfig,
  getOAuthConfig,
  type OAuthConfig,
} from "./config.js";

function parseEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type HostedAccessMode = "protected" | "dev_open";

export type HostedAccessPolicy = {
  mode: HostedAccessMode;
  allowUnauthenticatedHostedAccess: boolean;
  hostedAuthConfigured: boolean;
  oauthConfig: OAuthConfig;
  configurationError: string | null;
};

export type GetHostedAccessPolicyOptions = {
  env?: NodeJS.ProcessEnv;
  oauthConfig?: OAuthConfig;
  allowUnauthenticatedHostedDev?: boolean;
};

export function isUnauthenticatedHostedDevAllowed(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return parseEnabled(env.ALLOW_UNAUTHENTICATED_HOSTED_DEV);
}

function buildProtectedModeConfigurationError(reason?: string): string {
  const suffix = reason ? ` ${reason}` : "";
  return [
    "Hosted HTTP auth is protected by default.",
    "Configure OAUTH_ENABLED=true with the required OAUTH_* variables,",
    "or set ALLOW_UNAUTHENTICATED_HOSTED_DEV=true for local development only.",
    suffix,
  ]
    .join(" ")
    .trim();
}

export function getHostedAccessPolicy(
  options: GetHostedAccessPolicyOptions = {}
): HostedAccessPolicy {
  const env = options.env ?? process.env;
  const allowUnauthenticatedHostedDev =
    options.allowUnauthenticatedHostedDev ?? isUnauthenticatedHostedDevAllowed(env);

  let oauthConfig = options.oauthConfig;
  let configurationError: string | null = null;

  if (!oauthConfig) {
    try {
      oauthConfig = getOAuthConfig(env);
    } catch (error) {
      configurationError = buildProtectedModeConfigurationError(toErrorMessage(error));
      oauthConfig = createDisabledOAuthConfig(env);
    }
  }

  if (allowUnauthenticatedHostedDev) {
    return {
      mode: "dev_open",
      allowUnauthenticatedHostedAccess: true,
      hostedAuthConfigured: oauthConfig.enabled && configurationError === null,
      oauthConfig,
      configurationError,
    };
  }

  if (!oauthConfig.enabled) {
    configurationError ??= buildProtectedModeConfigurationError();
  }

  return {
    mode: "protected",
    allowUnauthenticatedHostedAccess: false,
    hostedAuthConfigured: oauthConfig.enabled && configurationError === null,
    oauthConfig,
    configurationError,
  };
}
