import type { ITranscriptStore, TranscriptStoreEntry } from "./transcript-store.js";
import { query } from "../db/connection.js";

function rowToEntry(row: Record<string, unknown>): TranscriptStoreEntry {
  return {
    seqNum: row.seq_num as number,
    entryType: row.entry_type as string,
    role: (row.role as string) ?? undefined,
    content: (row.content as string) ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    tokensIn: (row.tokens_in as number) ?? undefined,
    tokensOut: (row.tokens_out as number) ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
  };
}

export class PgTranscriptStore implements ITranscriptStore {
  async append(tenantId: string, sessionKey: string, entry: TranscriptStoreEntry): Promise<void> {
    // Look up the session id from the session_key + tenant_id
    const sessionResult = await query(
      `SELECT id FROM sessions WHERE tenant_id = $1 AND session_key = $2 LIMIT 1`,
      [tenantId, sessionKey],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Session not found for tenant ${tenantId} with key ${sessionKey}`);
    }

    const sessionId = sessionResult.rows[0].id as string;

    await query(
      `INSERT INTO session_transcripts
         (session_id, tenant_id, seq_num, entry_type, role, content, metadata, tokens_in, tokens_out)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        sessionId,
        tenantId,
        entry.seqNum,
        entry.entryType,
        entry.role ?? null,
        entry.content ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : "{}",
        entry.tokensIn ?? null,
        entry.tokensOut ?? null,
      ],
    );
  }

  async getTranscript(
    tenantId: string,
    sessionKey: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<TranscriptStoreEntry[]> {
    const limit = opts?.limit ?? 1000;
    const offset = opts?.offset ?? 0;

    const result = await query(
      `SELECT st.seq_num, st.entry_type, st.role, st.content, st.metadata,
              st.tokens_in, st.tokens_out, st.created_at
       FROM session_transcripts st
       JOIN sessions s ON s.id = st.session_id
       WHERE st.tenant_id = $1 AND s.session_key = $2
       ORDER BY st.seq_num ASC
       LIMIT $3 OFFSET $4`,
      [tenantId, sessionKey, limit, offset],
    );

    return result.rows.map(rowToEntry);
  }

  async deleteTranscript(tenantId: string, sessionKey: string): Promise<void> {
    await query(
      `DELETE FROM session_transcripts st
       USING sessions s
       WHERE st.session_id = s.id
         AND st.tenant_id = $1
         AND s.session_key = $2`,
      [tenantId, sessionKey],
    );
  }

  async deleteOlderThan(tenantId: string, beforeDate: Date): Promise<number> {
    const result = await query(
      `DELETE FROM session_transcripts
       WHERE tenant_id = $1 AND created_at < $2`,
      [tenantId, beforeDate.toISOString()],
    );
    return result.rowCount ?? 0;
  }
}
