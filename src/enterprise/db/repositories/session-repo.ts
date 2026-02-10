import { query } from "../connection.js";

export type Session = {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string;
  sessionKey: string;
  sessionData: Record<string, unknown>;
  transcriptPath: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
};

export type TranscriptEntry = {
  id: number;
  sessionId: string;
  tenantId: string;
  seqNum: number;
  entryType: string;
  role: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: Date;
};

/** Map a database row (snake_case) to a Session object (camelCase). */
function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    userId: row.user_id as string,
    agentId: row.agent_id as string,
    sessionKey: row.session_key as string,
    sessionData: (row.session_data ?? {}) as Record<string, unknown>,
    transcriptPath: (row.transcript_path as string) ?? null,
    status: row.status as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
  };
}

/** Map a database row (snake_case) to a TranscriptEntry object (camelCase). */
function rowToTranscriptEntry(row: Record<string, unknown>): TranscriptEntry {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    tenantId: row.tenant_id as string,
    seqNum: row.seq_num as number,
    entryType: row.entry_type as string,
    role: (row.role as string) ?? null,
    content: (row.content as string) ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    tokensIn: (row.tokens_in as number) ?? null,
    tokensOut: (row.tokens_out as number) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

export async function createSession(
  tenantId: string,
  data: {
    userId: string;
    agentId?: string;
    sessionKey: string;
    sessionData?: Record<string, unknown>;
  },
): Promise<Session> {
  const { userId, agentId, sessionKey, sessionData } = data;
  const result = await query(
    `INSERT INTO sessions (tenant_id, user_id, agent_id, session_key, session_data)
     VALUES ($1, $2, $3, $4, COALESCE($5::jsonb, '{}'::jsonb))
     RETURNING *`,
    [
      tenantId,
      userId,
      agentId ?? null,
      sessionKey,
      sessionData ? JSON.stringify(sessionData) : null,
    ],
  );
  return rowToSession(result.rows[0]);
}

export async function getSessionById(tenantId: string, sessionId: string): Promise<Session | null> {
  const result = await query("SELECT * FROM sessions WHERE id = $1 AND tenant_id = $2", [
    sessionId,
    tenantId,
  ]);
  return result.rows.length > 0 ? rowToSession(result.rows[0]) : null;
}

export async function getSessionByKey(
  tenantId: string,
  agentId: string,
  sessionKey: string,
): Promise<Session | null> {
  const result = await query(
    "SELECT * FROM sessions WHERE tenant_id = $1 AND agent_id = $2 AND session_key = $3",
    [tenantId, agentId, sessionKey],
  );
  return result.rows.length > 0 ? rowToSession(result.rows[0]) : null;
}

export async function listSessions(
  tenantId: string,
  filters?: {
    userId?: string;
    agentId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ sessions: Session[]; total: number }> {
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(filters.userId);
  }
  if (filters?.agentId) {
    conditions.push(`agent_id = $${idx++}`);
    params.push(filters.agentId);
  }
  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.search) {
    conditions.push(`session_key ILIKE $${idx++}`);
    params.push(`%${filters.search}%`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM sessions ${where}`, params);
  const total: number = countResult.rows[0].total;

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  const result = await query(
    `SELECT * FROM sessions ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  return { sessions: result.rows.map(rowToSession), total };
}

export async function listUserSessions(
  tenantId: string,
  userId: string,
  filters?: { limit?: number; offset?: number },
): Promise<{ sessions: Session[]; total: number }> {
  const countResult = await query(
    "SELECT COUNT(*)::int AS total FROM sessions WHERE tenant_id = $1 AND user_id = $2",
    [tenantId, userId],
  );
  const total: number = countResult.rows[0].total;

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const result = await query(
    `SELECT * FROM sessions WHERE tenant_id = $1 AND user_id = $2
     ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
    [tenantId, userId, limit, offset],
  );

  return { sessions: result.rows.map(rowToSession), total };
}

export async function updateSession(
  tenantId: string,
  sessionId: string,
  data: Partial<{ sessionData: Record<string, unknown>; status: string }>,
): Promise<Session> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.sessionData !== undefined) {
    setClauses.push(`session_data = $${idx++}::jsonb`);
    params.push(JSON.stringify(data.sessionData));
  }
  if (data.status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    params.push(data.status);
  }

  if (setClauses.length === 0) {
    const existing = await getSessionById(tenantId, sessionId);
    if (!existing) throw new Error(`Session not found: ${sessionId}`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(sessionId, tenantId);

  const result = await query(
    `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return rowToSession(result.rows[0]);
}

export async function deleteSession(tenantId: string, sessionId: string): Promise<void> {
  const result = await query("DELETE FROM sessions WHERE id = $1 AND tenant_id = $2", [
    sessionId,
    tenantId,
  ]);
  if (result.rowCount === 0) {
    throw new Error(`Session not found: ${sessionId}`);
  }
}

export async function appendTranscriptEntry(
  sessionId: string,
  tenantId: string,
  entry: {
    seqNum: number;
    entryType: string;
    role?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    tokensIn?: number;
    tokensOut?: number;
  },
): Promise<void> {
  await query(
    `INSERT INTO session_transcripts
       (session_id, tenant_id, seq_num, entry_type, role, content, metadata, tokens_in, tokens_out)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::jsonb, '{}'::jsonb), $8, $9)`,
    [
      sessionId,
      tenantId,
      entry.seqNum,
      entry.entryType,
      entry.role ?? null,
      entry.content ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.tokensIn ?? null,
      entry.tokensOut ?? null,
    ],
  );
}

export async function getTranscript(
  tenantId: string,
  sessionId: string,
  opts?: { limit?: number; offset?: number },
): Promise<TranscriptEntry[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const result = await query(
    `SELECT * FROM session_transcripts
     WHERE session_id = $1 AND tenant_id = $2
     ORDER BY seq_num ASC
     LIMIT $3 OFFSET $4`,
    [sessionId, tenantId, limit, offset],
  );

  return result.rows.map(rowToTranscriptEntry);
}

export async function deleteExpiredSessions(tenantId: string, beforeDate: Date): Promise<number> {
  const result = await query(
    "DELETE FROM sessions WHERE tenant_id = $1 AND expires_at IS NOT NULL AND expires_at < $2",
    [tenantId, beforeDate.toISOString()],
  );
  return result.rowCount ?? 0;
}
