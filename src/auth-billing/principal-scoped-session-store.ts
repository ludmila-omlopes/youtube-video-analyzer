import type { AnalysisSession, AnalysisSessionStore } from "@ludylops/video-analysis-core";
import { getPrincipalKey, type AuthPrincipal } from "./principal.js";
import type { RemoteAccessStore } from "./remote-access-store.js";

function withOwnerId(session: AnalysisSession, ownerId: string): AnalysisSession {
  if (session.ownerId === ownerId) {
    return session;
  }

  return { ...session, ownerId };
}

class PrincipalScopedAnalysisSessionStore implements AnalysisSessionStore {
  private readonly ownerId: string;

  constructor(
    private readonly sessionStore: AnalysisSessionStore,
    private readonly principal: AuthPrincipal,
    private readonly remoteAccessStore: RemoteAccessStore
  ) {
    this.ownerId = getPrincipalKey(principal);
  }

  async get(sessionId: string): Promise<AnalysisSession | null> {
    const rememberedOwnerId = await this.remoteAccessStore.getSessionOwner(sessionId);
    if (rememberedOwnerId && rememberedOwnerId !== this.ownerId) {
      return null;
    }

    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      return null;
    }

    const effectiveOwnerId = session.ownerId ?? rememberedOwnerId;
    if (!effectiveOwnerId) {
      return null;
    }

    if (effectiveOwnerId !== this.ownerId) {
      return null;
    }

    if (!rememberedOwnerId) {
      await this.remoteAccessStore.setSessionOwner(sessionId, this.ownerId);
    }

    return withOwnerId(session, this.ownerId);
  }

  async set(session: AnalysisSession): Promise<void> {
    await this.remoteAccessStore.upsertAccount(this.principal);
    await this.sessionStore.set(withOwnerId(session, this.ownerId));
    await this.remoteAccessStore.setSessionOwner(session.sessionId, this.ownerId);
  }

  async delete(sessionId: string): Promise<void> {
    const rememberedOwnerId = await this.remoteAccessStore.getSessionOwner(sessionId);
    if (rememberedOwnerId && rememberedOwnerId !== this.ownerId) {
      return;
    }

    await this.sessionStore.delete?.(sessionId);
    await this.remoteAccessStore.deleteSessionOwner?.(sessionId);
  }
}

export function createPrincipalScopedSessionStore(
  sessionStore: AnalysisSessionStore,
  principal: AuthPrincipal,
  remoteAccessStore: RemoteAccessStore
): AnalysisSessionStore {
  return new PrincipalScopedAnalysisSessionStore(sessionStore, principal, remoteAccessStore);
}
