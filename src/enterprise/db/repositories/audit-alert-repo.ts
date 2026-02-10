import { query } from "../connection.js";

export interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  conditions: Record<string, unknown>;
  notificationChannels: Array<{ type: string; target: string }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEntry {
  id: string;
  tenantId: string;
  ruleId: string;
  ruleName?: string;
  eventId: string | null;
  triggeredAt: string;
  details: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

function rowToAlertRule(row: Record<string, unknown>): AlertRule {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    description: row.description as string | null,
    conditions: (row.conditions ?? {}) as Record<string, unknown>,
    notificationChannels: (row.notification_channels ?? []) as Array<{
      type: string;
      target: string;
    }>,
    enabled: row.enabled as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function rowToAlert(row: Record<string, unknown>): AlertEntry {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    ruleId: row.rule_id as string,
    ruleName: row.rule_name as string | undefined,
    eventId: row.event_id as string | null,
    triggeredAt: (row.triggered_at as Date).toISOString(),
    details: (row.details ?? {}) as Record<string, unknown>,
    acknowledged: row.acknowledged as boolean,
    acknowledgedBy: row.acknowledged_by as string | null,
    acknowledgedAt: row.acknowledged_at ? (row.acknowledged_at as Date).toISOString() : null,
  };
}

// ── Alert Rules ──────────────────────────────────────────────

export async function createAlertRule(
  tenantId: string,
  data: {
    name: string;
    description?: string;
    conditions: Record<string, unknown>;
    notificationChannels?: unknown[];
    enabled?: boolean;
  },
): Promise<AlertRule> {
  const result = await query(
    `INSERT INTO audit_alert_rules (tenant_id, name, description, conditions, notification_channels, enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      data.name,
      data.description ?? null,
      JSON.stringify(data.conditions),
      JSON.stringify(data.notificationChannels ?? []),
      data.enabled ?? true,
    ],
  );
  return rowToAlertRule(result.rows[0]);
}

export async function listAlertRules(tenantId: string): Promise<AlertRule[]> {
  const result = await query(
    `SELECT * FROM audit_alert_rules WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return result.rows.map(rowToAlertRule);
}

export async function updateAlertRule(
  tenantId: string,
  ruleId: string,
  data: {
    name?: string;
    description?: string;
    conditions?: Record<string, unknown>;
    notificationChannels?: unknown[];
    enabled?: boolean;
  },
): Promise<AlertRule | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(data.description);
  }
  if (data.conditions !== undefined) {
    sets.push(`conditions = $${idx++}`);
    values.push(JSON.stringify(data.conditions));
  }
  if (data.notificationChannels !== undefined) {
    sets.push(`notification_channels = $${idx++}`);
    values.push(JSON.stringify(data.notificationChannels));
  }
  if (data.enabled !== undefined) {
    sets.push(`enabled = $${idx++}`);
    values.push(data.enabled);
  }

  if (sets.length === 0) return null;

  sets.push(`updated_at = NOW()`);
  values.push(tenantId, ruleId);

  const result = await query(
    `UPDATE audit_alert_rules SET ${sets.join(", ")} WHERE tenant_id = $${idx++} AND id = $${idx++} RETURNING *`,
    values,
  );

  return result.rows.length > 0 ? rowToAlertRule(result.rows[0]) : null;
}

export async function deleteAlertRule(tenantId: string, ruleId: string): Promise<boolean> {
  const result = await query(`DELETE FROM audit_alert_rules WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    ruleId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

// ── Alerts ───────────────────────────────────────────────────

export async function listAlerts(
  tenantId: string,
  options?: { acknowledged?: boolean; limit?: number; offset?: number },
): Promise<{ entries: AlertEntry[]; total: number }> {
  const conditions = [`a.tenant_id = $1`];
  const values: unknown[] = [tenantId];
  let idx = 2;

  if (options?.acknowledged !== undefined) {
    conditions.push(`a.acknowledged = $${idx++}`);
    values.push(options.acknowledged);
  }

  const where = conditions.join(" AND ");

  const countResult = await query(
    `SELECT COUNT(*) as count FROM audit_alerts a WHERE ${where}`,
    values,
  );
  const total = parseInt(countResult.rows[0].count as string, 10);

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  values.push(limit, offset);

  const result = await query(
    `SELECT a.*, r.name as rule_name
     FROM audit_alerts a
     LEFT JOIN audit_alert_rules r ON r.id = a.rule_id
     WHERE ${where}
     ORDER BY a.triggered_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    values,
  );

  return { entries: result.rows.map(rowToAlert), total };
}

export async function acknowledgeAlert(
  tenantId: string,
  alertId: string,
  userId: string,
): Promise<AlertEntry | null> {
  const result = await query(
    `UPDATE audit_alerts
     SET acknowledged = true, acknowledged_by = $3, acknowledged_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, alertId, userId],
  );
  return result.rows.length > 0 ? rowToAlert(result.rows[0]) : null;
}
