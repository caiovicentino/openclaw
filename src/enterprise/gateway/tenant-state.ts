export type TenantRuntimeState = {
  tenantId: string;
  agentRunSeq: Map<string, number>;
  chatAbortControllers: Map<string, AbortController>;
  dedupe: Map<string, number>;
  activeSessionKeys: Set<string>;
  lastHeartbeat: Map<string, number>;
};

function createTenantRuntimeState(tenantId: string): TenantRuntimeState {
  return {
    tenantId,
    agentRunSeq: new Map(),
    chatAbortControllers: new Map(),
    dedupe: new Map(),
    activeSessionKeys: new Set(),
    lastHeartbeat: new Map(),
  };
}

const DEFAULT_DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class TenantStateManager {
  private states = new Map<string, TenantRuntimeState>();

  getOrCreate(tenantId: string): TenantRuntimeState {
    let state = this.states.get(tenantId);
    if (!state) {
      state = createTenantRuntimeState(tenantId);
      this.states.set(tenantId, state);
    }
    return state;
  }

  get(tenantId: string): TenantRuntimeState | undefined {
    return this.states.get(tenantId);
  }

  delete(tenantId: string): void {
    const state = this.states.get(tenantId);
    if (state) {
      // Abort any active chat controllers before deleting
      for (const controller of state.chatAbortControllers.values()) {
        controller.abort();
      }
      this.states.delete(tenantId);
    }
  }

  // --- Scoped operations ---

  getNextRunSeq(tenantId: string, agentId: string): number {
    const state = this.getOrCreate(tenantId);
    const current = state.agentRunSeq.get(agentId) ?? 0;
    const next = current + 1;
    state.agentRunSeq.set(agentId, next);
    return next;
  }

  setAbortController(tenantId: string, sessionKey: string, controller: AbortController): void {
    const state = this.getOrCreate(tenantId);
    state.chatAbortControllers.set(sessionKey, controller);
  }

  abortChat(tenantId: string, sessionKey: string): boolean {
    const state = this.states.get(tenantId);
    if (!state) return false;
    const controller = state.chatAbortControllers.get(sessionKey);
    if (!controller) return false;
    controller.abort();
    state.chatAbortControllers.delete(sessionKey);
    return true;
  }

  isDuplicate(tenantId: string, messageId: string, ttlMs: number = DEFAULT_DEDUPE_TTL_MS): boolean {
    const state = this.getOrCreate(tenantId);
    const existing = state.dedupe.get(messageId);
    const now = Date.now();
    if (existing !== undefined && now - existing < ttlMs) {
      return true;
    }
    state.dedupe.set(messageId, now);
    return false;
  }

  markSessionActive(tenantId: string, sessionKey: string): void {
    this.getOrCreate(tenantId).activeSessionKeys.add(sessionKey);
  }

  markSessionInactive(tenantId: string, sessionKey: string): void {
    const state = this.states.get(tenantId);
    if (state) {
      state.activeSessionKeys.delete(sessionKey);
    }
  }

  isSessionActive(tenantId: string, sessionKey: string): boolean {
    const state = this.states.get(tenantId);
    return state ? state.activeSessionKeys.has(sessionKey) : false;
  }

  recordHeartbeat(tenantId: string, agentId: string): void {
    this.getOrCreate(tenantId).lastHeartbeat.set(agentId, Date.now());
  }

  getLastHeartbeat(tenantId: string, agentId: string): number | undefined {
    return this.states.get(tenantId)?.lastHeartbeat.get(agentId);
  }

  // --- Cleanup ---

  cleanupTenant(tenantId: string): void {
    this.delete(tenantId);
  }

  cleanupExpiredDedupes(maxAgeMs: number = DEFAULT_DEDUPE_TTL_MS): void {
    const now = Date.now();
    for (const state of this.states.values()) {
      for (const [id, timestamp] of state.dedupe) {
        if (now - timestamp >= maxAgeMs) {
          state.dedupe.delete(id);
        }
      }
    }
  }

  getStats(): { tenantCount: number; totalSessions: number; totalRunSeqs: number } {
    let totalSessions = 0;
    let totalRunSeqs = 0;
    for (const state of this.states.values()) {
      totalSessions += state.activeSessionKeys.size;
      totalRunSeqs += state.agentRunSeq.size;
    }
    return {
      tenantCount: this.states.size,
      totalSessions,
      totalRunSeqs,
    };
  }
}
