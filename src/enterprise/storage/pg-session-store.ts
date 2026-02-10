import type { ISessionStore, SessionStoreEntry } from "./session-store.js";
import { query } from "../db/connection.js";

function rowToEntry(row: Record<string, unknown>): SessionStoreEntry {
  return {
    sessionKey: row.session_key as string,
    sessionData: (row.session_data ?? {}) as Record<string, unknown>,
    userId: (row.user_id as string) ?? undefined,
    status: (row.status as string) ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
  };
}

export class PgSessionStore implements ISessionStore {
  async get(
    tenantId: string,
    agentId: string,
    sessionKey: string,
  ): Promise<SessionStoreEntry | null> {
    const result = await query(
      `SELECT session_key, session_data, user_id, status, created_at, updated_at
       FROM sessions
       WHERE tenant_id = $1 AND agent_id = $2 AND session_key = $3`,
      [tenantId, agentId, sessionKey],
    );
    return result.rows.length > 0 ? rowToEntry(result.rows[0]) : null;
  }

  async set(
    tenantId: string,
    agentId: string,
    sessionKey: string,
    data: SessionStoreEntry,
  ): Promise<void> {
    await query(
      `INSERT INTO sessions (tenant_id, agent_id, session_key, session_data, user_id, status)
       VALUES ($1, $2, $3, $4::jsonb, $5, COALESCE($6, 'active'))
       ON CONFLICT (tenant_id, agent_id, session_key)
       DO UPDATE SET
         session_data = $4::jsonb,
         user_id = COALESCE($5, sessions.user_id),
         status = COALESCE($6, sessions.status),
         updated_at = NOW()`,
      [
        tenantId,
        agentId,
        sessionKey,
        JSON.stringify(data.sessionData),
        data.userId ?? null,
        data.status ?? null,
      ],
    );
  }

  async list(
    tenantId: string,
    agentId: string,
    filters?: { userId?: string; limit?: number; offset?: number },
  ): Promise<SessionStoreEntry[]> {
    const conditions = ["tenant_id = $1", "agent_id = $2"];
    const params: unknown[] = [tenantId, agentId];
    let idx = 3;

    if (filters?.userId) {
      conditions.push(`user_id = $${idx++}`);
      params.push(filters.userId);
    }

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    params.push(limit, offset);

    const result = await query(
      `SELECT session_key, session_data, user_id, status, created_at, updated_at
       FROM sessions
       WHERE ${conditions.join(" AND ")}
       ORDER BY updated_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params,
    );

    return result.rows.map(rowToEntry);
  }

  async delete(tenantId: string, agentId: string, sessionKey: string): Promise<void> {
    await query(
      `DELETE FROM sessions
       WHERE tenant_id = $1 AND agent_id = $2 AND session_key = $3`,
      [tenantId, agentId, sessionKey],
    );
  }

  async deleteExpired(tenantId: string, beforeDate: Date): Promise<number> {
    const result = await query(
      `DELETE FROM sessions
       WHERE tenant_id = $1 AND expires_at IS NOT NULL AND expires_at < $2`,
      [tenantId, beforeDate.toISOString()],
    );
    return result.rowCount ?? 0;
  }
}
