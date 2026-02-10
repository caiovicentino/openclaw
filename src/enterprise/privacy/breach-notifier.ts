import { query } from "../db/connection.js";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BreachSeverity = "low" | "medium" | "high" | "critical";
export type BreachStatus = "detected" | "investigating" | "contained" | "notified" | "resolved";

export interface BreachRecord {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  severity: BreachSeverity;
  status: BreachStatus;
  affectedUsers: number;
  dataCategories: string[];
  detectedAt: Date;
  containedAt: Date | null;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
  reportedBy: string | null;
  notificationDetails: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateBreachInput {
  tenantId: string;
  title: string;
  description: string;
  severity: BreachSeverity;
  affectedUsers?: number;
  dataCategories?: string[];
  reportedBy?: string;
}

// ---------------------------------------------------------------------------
// Table bootstrap
// ---------------------------------------------------------------------------

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS breach_records (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title                 VARCHAR(255) NOT NULL,
    description           TEXT,
    severity              VARCHAR(16) NOT NULL DEFAULT 'medium',
    status                VARCHAR(16) NOT NULL DEFAULT 'detected',
    affected_users        INTEGER DEFAULT 0,
    data_categories       JSONB DEFAULT '[]',
    detected_at           TIMESTAMPTZ DEFAULT NOW(),
    contained_at          TIMESTAMPTZ,
    notified_at           TIMESTAMPTZ,
    resolved_at           TIMESTAMPTZ,
    reported_by           UUID REFERENCES users(id),
    notification_details  JSONB,
    created_at            TIMESTAMPTZ DEFAULT NOW()
  )
`;

export async function ensureBreachTable(): Promise<void> {
  await query(ENSURE_TABLE_SQL);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Record a new data breach.
 * LGPD Art. 48 / GDPR Art. 33 require notification within 72 hours.
 */
export async function createBreach(input: CreateBreachInput): Promise<BreachRecord> {
  const result = await query<Record<string, unknown>>(
    `INSERT INTO breach_records
       (tenant_id, title, description, severity, affected_users, data_categories, reported_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING *`,
    [
      input.tenantId,
      input.title,
      input.description,
      input.severity,
      input.affectedUsers ?? 0,
      JSON.stringify(input.dataCategories ?? []),
      input.reportedBy ?? null,
    ],
  );

  const breach = toBreachRecord(result.rows[0]);

  logger.warn("Breach detected", {
    breachId: breach.id,
    severity: breach.severity,
    tenantId: input.tenantId,
  });

  return breach;
}

/** Get a breach record by ID, scoped to tenant. */
export async function getBreach(tenantId: string, breachId: string): Promise<BreachRecord | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM breach_records WHERE id = $1 AND tenant_id = $2`,
    [breachId, tenantId],
  );
  return result.rows[0] ? toBreachRecord(result.rows[0]) : null;
}

/** List breach records for a tenant. */
export async function listBreaches(
  tenantId: string,
  filters?: { status?: BreachStatus; severity?: BreachSeverity; limit?: number; offset?: number },
): Promise<BreachRecord[]> {
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.severity) {
    conditions.push(`severity = $${idx++}`);
    params.push(filters.severity);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  const result = await query<Record<string, unknown>>(
    `SELECT * FROM breach_records
     WHERE ${conditions.join(" AND ")}
     ORDER BY detected_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  return result.rows.map(toBreachRecord);
}

/** Mark a breach as contained. */
export async function markBreachContained(tenantId: string, breachId: string): Promise<void> {
  await query(
    `UPDATE breach_records
     SET status = 'contained', contained_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [breachId, tenantId],
  );
}

/**
 * Record that the authority and affected users have been notified.
 * LGPD Art. 48: must notify ANPD and data subjects.
 * GDPR Art. 33/34: must notify supervisory authority within 72h.
 */
export async function markBreachNotified(
  tenantId: string,
  breachId: string,
  details: {
    authorityNotifiedAt?: string;
    usersNotifiedAt?: string;
    authorityReference?: string;
    notificationMethod?: string;
  },
): Promise<void> {
  await query(
    `UPDATE breach_records
     SET status = 'notified',
         notified_at = NOW(),
         notification_details = $3::jsonb
     WHERE id = $1 AND tenant_id = $2`,
    [breachId, tenantId, JSON.stringify(details)],
  );
}

/** Mark a breach as resolved. */
export async function markBreachResolved(tenantId: string, breachId: string): Promise<void> {
  await query(
    `UPDATE breach_records
     SET status = 'resolved', resolved_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [breachId, tenantId],
  );
}

/**
 * Check for breaches that must be notified (detected > 72h ago, not yet notified).
 * Useful for compliance dashboards and alerting.
 */
export async function listOverdueBreachNotifications(tenantId: string): Promise<BreachRecord[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM breach_records
     WHERE tenant_id = $1
       AND status IN ('detected', 'investigating', 'contained')
       AND notified_at IS NULL
       AND detected_at < NOW() - INTERVAL '72 hours'
     ORDER BY detected_at ASC`,
    [tenantId],
  );
  return result.rows.map(toBreachRecord);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toBreachRecord(row: Record<string, unknown>): BreachRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    severity: row.severity as BreachSeverity,
    status: row.status as BreachStatus,
    affectedUsers: (row.affected_users as number) ?? 0,
    dataCategories: (row.data_categories as string[]) ?? [],
    detectedAt: new Date(row.detected_at as string),
    containedAt: row.contained_at ? new Date(row.contained_at as string) : null,
    notifiedAt: row.notified_at ? new Date(row.notified_at as string) : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
    reportedBy: (row.reported_by as string) ?? null,
    notificationDetails: (row.notification_details as Record<string, unknown>) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}
