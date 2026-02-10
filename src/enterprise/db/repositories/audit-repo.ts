import { query } from "../connection.js";

export type AuditEntry = {
  id: number;
  tenantId: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  sessionKey: string | null;
  severity: string;
  createdAt: Date;
};

export type AuditStats = {
  totalEvents: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
};

function rowToAuditEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: row.id as number,
    tenantId: row.tenant_id as string,
    userId: (row.user_id as string) ?? null,
    action: row.action as string,
    resourceType: (row.resource_type as string) ?? null,
    resourceId: (row.resource_id as string) ?? null,
    details: (row.details ?? {}) as Record<string, unknown>,
    ipAddress: (row.ip_address as string) ?? null,
    userAgent: (row.user_agent as string) ?? null,
    sessionKey: (row.session_key as string) ?? null,
    severity: row.severity as string,
    createdAt: new Date(row.created_at as string),
  };
}

export async function logAuditEvent(event: {
  tenantId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  sessionKey?: string;
  severity?: string;
}): Promise<void> {
  await query(
    `INSERT INTO audit_log
       (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, session_key, severity)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'::jsonb), $7, $8, $9, COALESCE($10, 'info'))`,
    [
      event.tenantId,
      event.userId ?? null,
      event.action,
      event.resourceType ?? null,
      event.resourceId ?? null,
      event.details ? JSON.stringify(event.details) : null,
      event.ipAddress ?? null,
      event.userAgent ?? null,
      event.sessionKey ?? null,
      event.severity ?? null,
    ],
  );
}

export async function queryAuditLog(
  tenantId: string,
  filters: {
    userId?: string;
    action?: string;
    resourceType?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  },
): Promise<{ entries: AuditEntry[]; total: number }> {
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(filters.userId);
  }
  if (filters.action) {
    conditions.push(`action = $${idx++}`);
    params.push(filters.action);
  }
  if (filters.resourceType) {
    conditions.push(`resource_type = $${idx++}`);
    params.push(filters.resourceType);
  }
  if (filters.severity) {
    conditions.push(`severity = $${idx++}`);
    params.push(filters.severity);
  }
  if (filters.startDate) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(filters.endDate);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM audit_log ${where}`, params);
  const total: number = countResult.rows[0].total;

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  params.push(limit, offset);

  const result = await query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  return { entries: result.rows.map(rowToAuditEntry), total };
}

export async function getAuditStats(
  tenantId: string,
  period: "day" | "week" | "month",
): Promise<AuditStats> {
  const intervalMap = { day: "1 day", week: "7 days", month: "30 days" };
  const interval = intervalMap[period];

  const totalResult = await query(
    `SELECT COUNT(*)::int AS total FROM audit_log
     WHERE tenant_id = $1 AND created_at >= NOW() - $2::interval`,
    [tenantId, interval],
  );

  const byActionResult = await query(
    `SELECT action, COUNT(*)::int AS count FROM audit_log
     WHERE tenant_id = $1 AND created_at >= NOW() - $2::interval
     GROUP BY action`,
    [tenantId, interval],
  );

  const bySeverityResult = await query(
    `SELECT severity, COUNT(*)::int AS count FROM audit_log
     WHERE tenant_id = $1 AND created_at >= NOW() - $2::interval
     GROUP BY severity`,
    [tenantId, interval],
  );

  const byAction: Record<string, number> = {};
  for (const row of byActionResult.rows) {
    byAction[row.action as string] = row.count as number;
  }

  const bySeverity: Record<string, number> = {};
  for (const row of bySeverityResult.rows) {
    bySeverity[row.severity as string] = row.count as number;
  }

  return {
    totalEvents: totalResult.rows[0].total as number,
    byAction,
    bySeverity,
  };
}

export async function deleteOldAuditEntries(tenantId: string, beforeDate: Date): Promise<number> {
  const result = await query(`DELETE FROM audit_log WHERE tenant_id = $1 AND created_at < $2`, [
    tenantId,
    beforeDate,
  ]);
  return result.rowCount ?? 0;
}
