import type { ApiKeyStore, AuthenticatedApiKey } from "./api-keys.js";

export function getApiKeyFromRequest(request: Request): string | null {
  const xApiKey = request.headers.get("x-api-key")?.trim();
  if (xApiKey) {
    return xApiKey;
  }

  const authorization = request.headers.get("authorization")?.trim();
  const match = /^ApiKey\s+(.+)$/i.exec(authorization ?? "");
  return match?.[1]?.trim() || null;
}

export async function authenticateApiKeyRequest(
  request: Request,
  apiKeyStore: ApiKeyStore
): Promise<AuthenticatedApiKey | null> {
  const rawKey = getApiKeyFromRequest(request);
  if (!rawKey) {
    return null;
  }

  return await apiKeyStore.authenticateApiKey(rawKey);
}
