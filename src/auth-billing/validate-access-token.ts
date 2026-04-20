import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
} from "jose";

import type { EnabledOAuthConfig } from "./config.js";
import type { AuthPrincipal } from "./principal.js";

const remoteJwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getRemoteJwkSet(jwksUrl: string) {
  const cached = remoteJwkSets.get(jwksUrl);
  if (cached) {
    return cached;
  }

  const next = createRemoteJWKSet(new URL(jwksUrl));
  remoteJwkSets.set(jwksUrl, next);
  return next;
}

function parseBearerToken(authorizationHeader: string | null): string {
  const trimmed = authorizationHeader?.trim();
  if (!trimmed) {
    throw new AccessTokenValidationError("Missing bearer access token.", "TOKEN_MISSING");
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new AccessTokenValidationError("Missing bearer access token.", "TOKEN_MISSING");
  }

  return token;
}

function normalizeScopes(payload: JWTPayload): string[] {
  const values = new Set<string>();

  const addScopeValue = (value: unknown) => {
    if (typeof value === "string") {
      for (const entry of value.split(/\s+/)) {
        const trimmed = entry.trim();
        if (trimmed) {
          values.add(trimmed);
        }
      }
      return;
    }

    if (!Array.isArray(value)) {
      return;
    }

    for (const entry of value) {
      if (typeof entry !== "string") {
        continue;
      }

      const trimmed = entry.trim();
      if (trimmed) {
        values.add(trimmed);
      }
    }
  };

  addScopeValue(payload.scope);
  addScopeValue((payload as Record<string, unknown>).scp);
  return [...values];
}

function toAccessTokenValidationError(error: unknown): AccessTokenValidationError {
  if (error instanceof AccessTokenValidationError) {
    return error;
  }

  if (error instanceof joseErrors.JWTExpired) {
    return new AccessTokenValidationError("Access token has expired.", "TOKEN_EXPIRED");
  }

  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "iss") {
      return new AccessTokenValidationError("Access token issuer is invalid.", "TOKEN_ISSUER_INVALID");
    }

    if (error.claim === "aud") {
      return new AccessTokenValidationError("Access token audience is invalid.", "TOKEN_AUDIENCE_INVALID");
    }

    return new AccessTokenValidationError("Access token claims are invalid.", "TOKEN_INVALID");
  }

  if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
    return new AccessTokenValidationError("Access token signature is invalid.", "TOKEN_INVALID");
  }

  if (error instanceof joseErrors.JWSInvalid || error instanceof joseErrors.JWTInvalid) {
    return new AccessTokenValidationError(
      "Access token is not a JWT this server can verify. For browser sign-in, set OAUTH_WEB_AUDIENCE to the same value as OAUTH_AUDIENCE (your API identifier) so the issuer returns a signed JWT access token, or paste a JWT manually.",
      "TOKEN_INVALID"
    );
  }

  return new AccessTokenValidationError("Access token is invalid.", "TOKEN_INVALID");
}

export type AccessTokenValidationErrorCode =
  | "TOKEN_MISSING"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_SCOPE_MISSING"
  | "TOKEN_ISSUER_INVALID"
  | "TOKEN_AUDIENCE_INVALID";

export class AccessTokenValidationError extends Error {
  constructor(
    message: string,
    readonly code: AccessTokenValidationErrorCode
  ) {
    super(message);
    this.name = "AccessTokenValidationError";
  }
}

export type VerifyAccessTokenPayload = (token: string, config: EnabledOAuthConfig) => Promise<JWTPayload>;

export type ValidateAccessTokenOptions = {
  verifyPayload?: VerifyAccessTokenPayload;
};

export async function verifyAccessTokenPayload(
  token: string,
  config: EnabledOAuthConfig
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getRemoteJwkSet(config.jwksUrl), {
    issuer: config.issuer,
    audience: config.audience,
    clockTolerance: config.clockToleranceSeconds,
  });

  return payload;
}

export async function validateAccessToken(
  authorizationHeader: string | null,
  config: EnabledOAuthConfig,
  options: ValidateAccessTokenOptions = {}
): Promise<AuthPrincipal> {
  const token = parseBearerToken(authorizationHeader);

  let payload: JWTPayload;
  try {
    payload = await (options.verifyPayload ?? verifyAccessTokenPayload)(token, config);
  } catch (error) {
    throw toAccessTokenValidationError(error);
  }

  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!subject) {
    throw new AccessTokenValidationError("Access token subject is missing.", "TOKEN_INVALID");
  }

  const scope = normalizeScopes(payload);
  if (config.requiredScope && !scope.includes(config.requiredScope)) {
    throw new AccessTokenValidationError(
      `Access token is missing required scope "${config.requiredScope}".`,
      "TOKEN_SCOPE_MISSING"
    );
  }

  const audience =
    Array.isArray(payload.aud)
      ? payload.aud.filter((entry): entry is string => typeof entry === "string")
      : typeof payload.aud === "string"
        ? payload.aud
        : config.audience;

  return {
    subject,
    issuer: typeof payload.iss === "string" ? payload.iss : config.issuer,
    audience,
    scope,
    tokenId: typeof payload.jti === "string" ? payload.jti : null,
    rawClaims: payload as Record<string, unknown>,
  };
}
