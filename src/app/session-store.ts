import type { AnalysisSession } from "../lib/types.js";

export interface AnalysisSessionStore {
  get(sessionId: string): Promise<AnalysisSession | null>;
  set(session: AnalysisSession): Promise<void>;
  delete?(sessionId: string): Promise<void>;
}

export class InMemoryAnalysisSessionStore implements AnalysisSessionStore {
  private readonly sessions = new Map<string, AnalysisSession>();

  async get(sessionId: string): Promise<AnalysisSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(session: AnalysisSession): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
