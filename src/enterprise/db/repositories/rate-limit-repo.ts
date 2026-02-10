import { query } from "../connection.js";

export interface RateLimit {
  id: string;
  tenantId: string;
  targetType: string;
  targetId: string | null;
  limitType: string;
  limitValue: number;
  warningThreshold: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToRateLimit(row: Record<string, unknown>): RateLimit {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    targetType: row.target_type as string,
    targetId: (row.target_id as string) ?? null,
    limitType: row.limit_type as string,
    limitValue: Number(row.limit_value),
    warningThreshold: Number(row.warning_threshold),
    enabled: row.enabled as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function createRateLimit(
  tenantId: string,
  data: {
    targetType: string;
    targetId?: string | null;
    limitType: string;
    limitValue: number;
    warningThreshold?: number;
    enabled?: boolean;
  },
): Promise<RateLimit> {
  const result = await query(
    `INSERT INTO rate_limits (tenant_id, target_type, target_id, limit_type, limit_value, warning_threshold, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      data.targetType,
      data.targetId ?? null,
      data.limitType,
      data.limitValue,
      data.warningThreshold ?? 0.8,
      data.enabled ?? true,
    ],
  );
  return rowToRateLimit(result.rows[0]);
}

export async function listRateLimits(tenantId: string): Promise<RateLimit[]> {
  const result = await query(
    `SELECT * FROM rate_limits WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return result.rows.map(rowToRateLimit);
}

export async function updateRateLimit(
  tenantId: string,
  id: string,
  data: {
    targetType?: string;
    targetId?: string | null;
    limitType?: string;
    limitValue?: number;
    warningThreshold?: number;
    enabled?: boolean;
  },
): Promise<RateLimit | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.targetType !== undefined) {
    sets.push(`target_type = $${idx++}`);
    params.push(data.targetType);
  }
  if (data.targetId !== undefined) {
    sets.push(`target_id = $${idx++}`);
    params.push(data.targetId);
  }
  if (data.limitType !== undefined) {
    sets.push(`limit_type = $${idx++}`);
    params.push(data.limitType);
  }
  if (data.limitValue !== undefined) {
    sets.push(`limit_value = $${idx++}`);
    params.push(data.limitValue);
  }
  if (data.warningThreshold !== undefined) {
    sets.push(`warning_threshold = $${idx++}`);
    params.push(data.warningThreshold);
  }
  if (data.enabled !== undefined) {
    sets.push(`enabled = $${idx++}`);
    params.push(data.enabled);
  }

  if (sets.length === 0) return null;

  sets.push("updated_at = NOW()");
  params.push(tenantId, id);

  const result = await query(
    `UPDATE rate_limits SET ${sets.join(", ")} WHERE tenant_id = $${idx++} AND id = $${idx} RETURNING *`,
    params,
  );

  return result.rows.length > 0 ? rowToRateLimit(result.rows[0]) : null;
}

export async function deleteRateLimit(tenantId: string, id: string): Promise<boolean> {
  const result = await query(`DELETE FROM rate_limits WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function getRateLimitsForTarget(
  tenantId: string,
  targetType: string,
  targetId: string,
): Promise<RateLimit[]> {
  const result = await query(
    `SELECT * FROM rate_limits WHERE tenant_id = $1 AND enabled = true
     AND (
       (target_type = $2 AND target_id = $3)
       OR (target_type = $2 AND target_id IS NULL)
       OR (target_type = 'tenant' AND target_id IS NULL)
     )
     ORDER BY limit_type`,
    [tenantId, targetType, targetId],
  );
  return result.rows.map(rowToRateLimit);
}
