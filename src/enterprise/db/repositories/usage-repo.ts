import { query } from "../connection.js";

export type UsageSummary = {
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  byModel: Array<{
    provider: string;
    model: string;
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
  }>;
};

export type DailyUsage = {
  date: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  uniqueUsers: number;
};

export type UserUsage = {
  userId: string;
  email: string;
  name: string;
  department?: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  sessionCount: number;
};

export async function recordUsage(data: {
  tenantId: string;
  userId: string;
  agentId: string;
  sessionKey?: string;
  modelProvider?: string;
  modelId?: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}): Promise<void> {
  await query(
    `INSERT INTO usage_records
       (tenant_id, user_id, agent_id, session_key, model_provider, model_id, tokens_input, tokens_output, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      data.tenantId,
      data.userId,
      data.agentId,
      data.sessionKey ?? null,
      data.modelProvider ?? null,
      data.modelId ?? null,
      data.tokensInput,
      data.tokensOutput,
      data.costUsd,
    ],
  );
}

async function getUsageSummary(whereClause: string, params: unknown[]): Promise<UsageSummary> {
  const totalsResult = await query(
    `SELECT
       COALESCE(SUM(tokens_input), 0)::bigint AS total_tokens_input,
       COALESCE(SUM(tokens_output), 0)::bigint AS total_tokens_output,
       COALESCE(SUM(cost_usd), 0)::numeric AS total_cost_usd
     FROM usage_records
     ${whereClause}`,
    params,
  );

  const row = totalsResult.rows[0];

  const byModelResult = await query(
    `SELECT
       model_provider,
       model_id,
       COALESCE(SUM(tokens_input), 0)::bigint AS tokens_input,
       COALESCE(SUM(tokens_output), 0)::bigint AS tokens_output,
       COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd
     FROM usage_records
     ${whereClause}
     GROUP BY model_provider, model_id`,
    params,
  );

  return {
    totalTokensInput: Number(row.total_tokens_input),
    totalTokensOutput: Number(row.total_tokens_output),
    totalCostUsd: Number(row.total_cost_usd),
    byModel: byModelResult.rows.map((r: Record<string, unknown>) => ({
      provider: (r.model_provider as string) ?? "unknown",
      model: (r.model_id as string) ?? "unknown",
      tokensInput: Number(r.tokens_input),
      tokensOutput: Number(r.tokens_output),
      costUsd: Number(r.cost_usd),
    })),
  };
}

export async function getUsageByUser(
  tenantId: string,
  userId: string,
  period: { start: Date; end: Date },
): Promise<UsageSummary> {
  return getUsageSummary(
    "WHERE tenant_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at <= $4",
    [tenantId, userId, period.start, period.end],
  );
}

export async function getUsageByTenant(
  tenantId: string,
  period: { start: Date; end: Date },
): Promise<UsageSummary> {
  return getUsageSummary("WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3", [
    tenantId,
    period.start,
    period.end,
  ]);
}

export async function getUsageByDepartment(
  tenantId: string,
  department: string,
  period: { start: Date; end: Date },
): Promise<UsageSummary> {
  return getUsageSummary(
    `WHERE tenant_id = $1 AND created_at >= $3 AND created_at <= $4
     AND user_id IN (SELECT id FROM users WHERE tenant_id = $1 AND department = $2)`,
    [tenantId, department, period.start, period.end],
  );
}

export async function getDailyUsage(tenantId: string, days: number): Promise<DailyUsage[]> {
  const result = await query(
    `SELECT
       created_at::date::text AS date,
       COALESCE(SUM(tokens_input), 0)::bigint AS tokens_input,
       COALESCE(SUM(tokens_output), 0)::bigint AS tokens_output,
       COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
       COUNT(DISTINCT user_id)::int AS unique_users
     FROM usage_records
     WHERE tenant_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
     GROUP BY created_at::date
     ORDER BY date`,
    [tenantId, days],
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    date: row.date as string,
    tokensInput: Number(row.tokens_input),
    tokensOutput: Number(row.tokens_output),
    costUsd: Number(row.cost_usd),
    uniqueUsers: row.unique_users as number,
  }));
}

export async function getUsageByModel(tenantId: string, startDate: string, endDate: string) {
  const result = await query(
    `SELECT model_id, SUM(tokens_input) as total_input, SUM(tokens_output) as total_output,
     SUM(cost_usd) as total_cost, COUNT(*) as request_count
     FROM usage_records WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY model_id ORDER BY total_cost DESC`,
    [tenantId, startDate, endDate],
  );
  return result.rows;
}

export async function getUsageByAgent(tenantId: string, startDate: string, endDate: string) {
  const result = await query(
    `SELECT ur.agent_id, ac.config->>'name' as agent_name,
     SUM(ur.tokens_input) as total_input, SUM(ur.tokens_output) as total_output,
     SUM(ur.cost_usd) as total_cost, COUNT(*) as request_count
     FROM usage_records ur LEFT JOIN agent_configs ac ON ur.agent_id = ac.id::text
     WHERE ur.tenant_id = $1 AND ur.created_at >= $2 AND ur.created_at <= $3
     GROUP BY ur.agent_id, ac.config->>'name' ORDER BY total_cost DESC`,
    [tenantId, startDate, endDate],
  );
  return result.rows;
}

export async function getSessionAnalytics(tenantId: string, startDate: string, endDate: string) {
  const result = await query(
    `SELECT DATE(created_at) as date, COUNT(DISTINCT session_key) as session_count,
     AVG(tokens_input + tokens_output) as avg_tokens_per_request,
     COUNT(*) as total_requests
     FROM usage_records WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY DATE(created_at) ORDER BY date`,
    [tenantId, startDate, endDate],
  );
  return result.rows;
}

export async function getUsageForecast(tenantId: string, days: number = 30) {
  const result = await query(
    `SELECT DATE(created_at) as date, SUM(cost_usd) as daily_cost
     FROM usage_records WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY DATE(created_at) ORDER BY date`,
    [tenantId, days],
  );
  return result.rows;
}

export async function getTopUsers(
  tenantId: string,
  period: { start: Date; end: Date },
  limit?: number,
): Promise<UserUsage[]> {
  const effectiveLimit = limit ?? 10;

  const result = await query(
    `SELECT
       u.id AS user_id,
       u.email,
       u.name,
       u.department,
       COALESCE(SUM(ur.tokens_input), 0)::bigint AS tokens_input,
       COALESCE(SUM(ur.tokens_output), 0)::bigint AS tokens_output,
       COALESCE(SUM(ur.cost_usd), 0)::numeric AS cost_usd,
       COUNT(DISTINCT ur.session_key)::int AS session_count
     FROM usage_records ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.tenant_id = $1 AND ur.created_at >= $2 AND ur.created_at <= $3
     GROUP BY u.id, u.email, u.name, u.department
     ORDER BY cost_usd DESC
     LIMIT $4`,
    [tenantId, period.start, period.end, effectiveLimit],
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    userId: row.user_id as string,
    email: row.email as string,
    name: row.name as string,
    department: (row.department as string) ?? undefined,
    tokensInput: Number(row.tokens_input),
    tokensOutput: Number(row.tokens_output),
    costUsd: Number(row.cost_usd),
    sessionCount: row.session_count as number,
  }));
}
