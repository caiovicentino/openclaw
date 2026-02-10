export interface ISessionStore {
  get(tenantId: string, agentId: string, sessionKey: string): Promise<SessionStoreEntry | null>;
  set(
    tenantId: string,
    agentId: string,
    sessionKey: string,
    data: SessionStoreEntry,
  ): Promise<void>;
  list(
    tenantId: string,
    agentId: string,
    filters?: { userId?: string; limit?: number; offset?: number },
  ): Promise<SessionStoreEntry[]>;
  delete(tenantId: string, agentId: string, sessionKey: string): Promise<void>;
  deleteExpired(tenantId: string, beforeDate: Date): Promise<number>;
}

export type SessionStoreEntry = {
  sessionKey: string;
  sessionData: Record<string, unknown>;
  userId?: string;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
};
