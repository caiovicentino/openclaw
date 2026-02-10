import { query, withTransaction } from "../db/connection.js";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DsarRequestType =
  | "access"
  | "rectification"
  | "erasure"
  | "portability"
  | "restriction";
export type DsarStatus = "pending" | "in_progress" | "completed" | "denied";

export interface DsarRequest {
  id: string;
  tenantId: string;
  userId: string;
  requestType: DsarRequestType;
  status: DsarStatus;
  details: Record<string, unknown>;
  response: Record<string, unknown> | null;
  requestedAt: Date;
  completedAt: Date | null;
  handledBy: string | null;
}

export interface CreateDsarInput {
  tenantId: string;
  userId: string;
  requestType: DsarRequestType;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Table bootstrap
// ---------------------------------------------------------------------------

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS dsar_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_type  VARCHAR(32) NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'pending',
    details       JSONB DEFAULT '{}',
    response      JSONB,
    requested_at  TIMESTAMPTZ DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    handled_by    UUID REFERENCES users(id)
  )
`;

export async function ensureDsarTable(): Promise<void> {
  await query(ENSURE_TABLE_SQL);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Create a new DSAR request. */
export async function createDsarRequest(input: CreateDsarInput): Promise<DsarRequest> {
  const result = await query<Record<string, unknown>>(
    `INSERT INTO dsar_requests (tenant_id, user_id, request_type, details)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.tenantId, input.userId, input.requestType, JSON.stringify(input.details ?? {})],
  );

  logger.info("DSAR request created", {
    requestType: input.requestType,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  return toDsarRequest(result.rows[0]);
}

/** Get a DSAR request by ID, scoped to tenant. */
export async function getDsarRequest(
  tenantId: string,
  requestId: string,
): Promise<DsarRequest | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM dsar_requests WHERE id = $1 AND tenant_id = $2`,
    [requestId, tenantId],
  );
  return result.rows[0] ? toDsarRequest(result.rows[0]) : null;
}

/** List DSAR requests for a tenant with optional status filter. */
export async function listDsarRequests(
  tenantId: string,
  filters?: { status?: DsarStatus; userId?: string; limit?: number; offset?: number },
): Promise<DsarRequest[]> {
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(filters.userId);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  const result = await query<Record<string, unknown>>(
    `SELECT * FROM dsar_requests
     WHERE ${conditions.join(" AND ")}
     ORDER BY requested_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  return result.rows.map(toDsarRequest);
}

/** Update DSAR request status and optionally attach a response. */
export async function updateDsarStatus(
  tenantId: string,
  requestId: string,
  status: DsarStatus,
  response?: Record<string, unknown>,
  handledBy?: string,
): Promise<DsarRequest | null> {
  const completedAt = status === "completed" || status === "denied" ? "NOW()" : "NULL";

  const result = await query<Record<string, unknown>>(
    `UPDATE dsar_requests
     SET status = $1,
         response = COALESCE($2, response),
         completed_at = ${completedAt},
         handled_by = COALESCE($3, handled_by)
     WHERE id = $4 AND tenant_id = $5
     RETURNING *`,
    [status, response ? JSON.stringify(response) : null, handledBy ?? null, requestId, tenantId],
  );

  if (result.rows[0]) {
    logger.info("DSAR request status updated", { requestId, status });
  }

  return result.rows[0] ? toDsarRequest(result.rows[0]) : null;
}

/**
 * LGPD/GDPR: The legal deadline for responding to DSARs.
 * LGPD: 15 days. GDPR: 30 days. Returns the stricter of the two.
 */
export function getDsarDeadlineDays(complianceMode?: string): number {
  if (complianceMode === "lgpd") return 15;
  if (complianceMode === "gdpr") return 30;
  // Default: use the stricter LGPD deadline
  return 15;
}

/** List DSAR requests that are past their deadline. */
export async function listOverdueDsarRequests(
  tenantId: string,
  deadlineDays: number,
): Promise<DsarRequest[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM dsar_requests
     WHERE tenant_id = $1
       AND status IN ('pending', 'in_progress')
       AND requested_at < NOW() - ($2 || ' days')::INTERVAL
     ORDER BY requested_at`,
    [tenantId, String(deadlineDays)],
  );
  return result.rows.map(toDsarRequest);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toDsarRequest(row: Record<string, unknown>): DsarRequest {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    userId: row.user_id as string,
    requestType: row.request_type as DsarRequestType,
    status: row.status as DsarStatus,
    details: (row.details as Record<string, unknown>) ?? {},
    response: (row.response as Record<string, unknown>) ?? null,
    requestedAt: row.requested_at as Date,
    completedAt: (row.completed_at as Date) ?? null,
    handledBy: (row.handled_by as string) ?? null,
  };
}
