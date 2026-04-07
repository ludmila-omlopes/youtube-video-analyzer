export type AuthPrincipal = {
  subject: string;
  issuer: string;
  audience: string | string[];
  scope: string[];
  tokenId: string | null;
  rawClaims: Record<string, unknown>;
};

export function getPrincipalKey(principal: AuthPrincipal): string {
  return `${principal.issuer}:${principal.subject}`;
}
