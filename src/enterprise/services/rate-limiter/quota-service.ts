import { query } from "../../db/connection.js";

export interface QuotaEntry {
  limitType: string;
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  warning: boolean;
}

export interface QuotaStatus {
  allowed: boolean;
  quotas: QuotaEntry[];
}

export async function checkQuota(
  tenantId: string,
  userId: string,
  agentId?: string,
): Promise<QuotaStatus> {
  const limits = await query(
    `SELECT * FROM rate_limits WHERE tenant_id = $1 AND enabled = true
     AND (target_id IS NULL OR target_id = $2 OR target_id = $3)
     ORDER BY limit_type`,
    [tenantId, userId, agentId ?? ""],
  );

  if (limits.rows.length === 0) {
    return { allowed: true, quotas: [] };
  }

  const quotas: QuotaEntry[] = [];

  for (const limit of limits.rows) {
    let used = 0;
    const limitType = limit.limit_type as string;
    const limitValue = Number(limit.limit_value);
    const warningThreshold = Number(limit.warning_threshold);

    if (limitType === "tokens_per_hour") {
      const result = await query(
        `SELECT COALESCE(SUM(tokens_input + tokens_output), 0) as total
         FROM usage_records WHERE tenant_id = $1 AND user_id = $2
         AND created_at >= NOW() - INTERVAL '1 hour'`,
        [tenantId, userId],
      );
      used = Number(result.rows[0]?.total ?? 0);
    } else if (limitType === "tokens_per_day") {
      const result = await query(
        `SELECT COALESCE(SUM(tokens_input + tokens_output), 0) as total
         FROM usage_records WHERE tenant_id = $1 AND user_id = $2
         AND created_at >= CURRENT_DATE`,
        [tenantId, userId],
      );
      used = Number(result.rows[0]?.total ?? 0);
    } else if (limitType === "cost_per_day") {
      const result = await query(
        `SELECT COALESCE(SUM(cost_usd), 0) as total
         FROM usage_records WHERE tenant_id = $1 AND user_id = $2
         AND created_at >= CURRENT_DATE`,
        [tenantId, userId],
      );
      used = Number(result.rows[0]?.total ?? 0);
    } else if (limitType === "requests_per_minute") {
      const result = await query(
        `SELECT COUNT(*) as total FROM usage_records
         WHERE tenant_id = $1 AND user_id = $2
         AND created_at >= NOW() - INTERVAL '1 minute'`,
        [tenantId, userId],
      );
      used = Number(result.rows[0]?.total ?? 0);
    }

    const remaining = Math.max(0, limitValue - used);
    const percentage = limitValue > 0 ? used / limitValue : 0;

    quotas.push({
      limitType,
      limit: limitValue,
      used,
      remaining,
      percentage,
      warning: percentage >= warningThreshold,
    });
  }

  const allowed = quotas.every((q) => q.remaining > 0);
  return { allowed, quotas };
}

export async function getQuotaStatus(tenantId: string, userId: string): Promise<QuotaStatus> {
  return checkQuota(tenantId, userId);
}
