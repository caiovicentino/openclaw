import { randomBytes } from "crypto";
import { query } from "../connection.js";

export interface ShareToken {
  id: string;
  tenantId: string;
  sessionId: string;
  userId: string;
  token: string;
  accessType: string;
  includeToolOutputs: boolean;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  revoked: boolean;
  createdAt: string;
}

export async function createShareToken(
  tenantId: string,
  sessionId: string,
  userId: string,
  options?: {
    includeToolOutputs?: boolean;
    expiresInHours?: number;
    maxViews?: number;
  },
): Promise<ShareToken> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = options?.expiresInHours
    ? new Date(Date.now() + options.expiresInHours * 3600000).toISOString()
    : null;

  const result = await query<ShareToken>(
    `INSERT INTO share_tokens (tenant_id, session_id, user_id, token, include_tool_outputs, expires_at, max_views)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      sessionId,
      userId,
      token,
      options?.includeToolOutputs ?? false,
      expiresAt,
      options?.maxViews ?? null,
    ],
  );

  return mapRow(result.rows[0]);
}

export async function getShareByToken(token: string): Promise<ShareToken | null> {
  const result = await query<any>(
    `SELECT * FROM share_tokens WHERE token = $1 AND revoked = false`,
    [token],
  );
  if (result.rows.length === 0) return null;

  const share = mapRow(result.rows[0]);

  // Check expiry
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return null;

  // Check max views
  if (share.maxViews && share.viewCount >= share.maxViews) return null;

  // Increment view count
  await query(
    `UPDATE share_tokens SET view_count = view_count + 1, updated_at = NOW() WHERE id = $1`,
    [share.id],
  );

  return share;
}

export async function listShareTokens(tenantId: string, sessionId?: string): Promise<ShareToken[]> {
  const sql = sessionId
    ? `SELECT * FROM share_tokens WHERE tenant_id = $1 AND session_id = $2 ORDER BY created_at DESC`
    : `SELECT * FROM share_tokens WHERE tenant_id = $1 ORDER BY created_at DESC`;
  const params = sessionId ? [tenantId, sessionId] : [tenantId];
  const result = await query<any>(sql, params);
  return result.rows.map(mapRow);
}

export async function revokeShareToken(tenantId: string, tokenId: string): Promise<void> {
  await query(
    `UPDATE share_tokens SET revoked = true, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [tokenId, tenantId],
  );
}

function mapRow(row: any): ShareToken {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sessionId: row.session_id,
    userId: row.user_id,
    token: row.token,
    accessType: row.access_type,
    includeToolOutputs: row.include_tool_outputs,
    expiresAt: row.expires_at,
    maxViews: row.max_views,
    viewCount: row.view_count,
    revoked: row.revoked,
    createdAt: row.created_at,
  };
}
