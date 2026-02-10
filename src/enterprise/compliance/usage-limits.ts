import { query } from "../db/connection.js";

export type LimitScope = "user" | "department" | "tenant";

export type LimitPeriod = "hourly" | "daily" | "weekly" | "monthly";

export type UsageLimit = {
  id: string;
  tenantId: string;
  scope: LimitScope;
  scopeId: string; // userId, department name, or tenantId
  period: LimitPeriod;
  maxTokens?: number;
  maxCostUsd?: number;
  maxRequests?: number;
  enabled: boolean;
  notifyAt?: number; // percentage threshold (0-100) to trigger a warning
  createdAt: Date;
  updatedAt: Date;
};

export type UsageLimitInput = Omit<UsageLimit, "id" | "createdAt" | "updatedAt">;

export type LimitCheckResult = {
  allowed: boolean;
  limit: UsageLimit;
  currentUsage: {
    tokens: number;
    costUsd: number;
    requests: number;
  };
  percentUsed: number;
  warningTriggered: boolean;
};

function getPeriodInterval(period: LimitPeriod): string {
  switch (period) {
    case "hourly":
      return "1 hour";
    case "daily":
      return "1 day";
    case "weekly":
      return "7 days";
    case "monthly":
      return "30 days";
  }
}

function buildScopeWhereClause(
  scope: LimitScope,
  scopeId: string,
  tenantId: string,
): { clause: string; params: unknown[] } {
  switch (scope) {
    case "user":
      return {
        clause: "WHERE tenant_id = $1 AND user_id = $2",
        params: [tenantId, scopeId],
      };
    case "department":
      return {
        clause: `WHERE tenant_id = $1 AND user_id IN (
          SELECT id FROM users WHERE tenant_id = $1 AND department = $2
        )`,
        params: [tenantId, scopeId],
      };
    case "tenant":
      return {
        clause: "WHERE tenant_id = $1",
        params: [tenantId],
      };
  }
}

export async function createUsageLimit(input: UsageLimitInput): Promise<UsageLimit> {
  const result = await query(
    `INSERT INTO compliance_policies (tenant_id, name, type, rules, enabled)
     VALUES ($1, $2, 'usage_limit', $3, $4)
     RETURNING id, created_at, updated_at`,
    [
      input.tenantId,
      `usage-limit:${input.scope}:${input.scopeId}:${input.period}`,
      JSON.stringify({
        scope: input.scope,
        scopeId: input.scopeId,
        period: input.period,
        maxTokens: input.maxTokens,
        maxCostUsd: input.maxCostUsd,
        maxRequests: input.maxRequests,
        notifyAt: input.notifyAt,
      }),
      input.enabled,
    ],
  );

  const row = result.rows[0];
  return {
    ...input,
    id: row.id as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function getUsageLimits(tenantId: string, scope?: LimitScope): Promise<UsageLimit[]> {
  const scopeFilter = scope ? " AND rules->>'scope' = $2" : "";
  const params: unknown[] = scope ? [tenantId, scope] : [tenantId];

  const result = await query(
    `SELECT id, tenant_id, rules, enabled, created_at, updated_at
     FROM compliance_policies
     WHERE tenant_id = $1 AND type = 'usage_limit'${scopeFilter}
     ORDER BY created_at DESC`,
    params,
  );

  return result.rows.map((row: Record<string, unknown>) => {
    const rules = row.rules as Record<string, unknown>;
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      scope: rules.scope as LimitScope,
      scopeId: rules.scopeId as string,
      period: rules.period as LimitPeriod,
      maxTokens: rules.maxTokens as number | undefined,
      maxCostUsd: rules.maxCostUsd as number | undefined,
      maxRequests: rules.maxRequests as number | undefined,
      enabled: row.enabled as boolean,
      notifyAt: rules.notifyAt as number | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  });
}

export async function updateUsageLimit(
  id: string,
  tenantId: string,
  updates: Partial<
    Pick<UsageLimit, "maxTokens" | "maxCostUsd" | "maxRequests" | "enabled" | "notifyAt">
  >,
): Promise<void> {
  // Fetch existing rules first
  const existing = await query(
    `SELECT rules, enabled FROM compliance_policies WHERE id = $1 AND tenant_id = $2 AND type = 'usage_limit'`,
    [id, tenantId],
  );

  if (existing.rows.length === 0) {
    throw new Error(`Usage limit ${id} not found`);
  }

  const rules = existing.rows[0].rules as Record<string, unknown>;

  if (updates.maxTokens !== undefined) rules.maxTokens = updates.maxTokens;
  if (updates.maxCostUsd !== undefined) rules.maxCostUsd = updates.maxCostUsd;
  if (updates.maxRequests !== undefined) rules.maxRequests = updates.maxRequests;
  if (updates.notifyAt !== undefined) rules.notifyAt = updates.notifyAt;

  const enabled = updates.enabled !== undefined ? updates.enabled : existing.rows[0].enabled;

  await query(
    `UPDATE compliance_policies SET rules = $1, enabled = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [JSON.stringify(rules), enabled, id, tenantId],
  );
}

export async function deleteUsageLimit(id: string, tenantId: string): Promise<void> {
  await query(
    `DELETE FROM compliance_policies WHERE id = $1 AND tenant_id = $2 AND type = 'usage_limit'`,
    [id, tenantId],
  );
}

export async function checkUsageLimit(
  tenantId: string,
  limit: UsageLimit,
): Promise<LimitCheckResult> {
  const interval = getPeriodInterval(limit.period);
  const { clause, params } = buildScopeWhereClause(limit.scope, limit.scopeId, tenantId);

  const paramOffset = params.length;
  const result = await query(
    `SELECT
       COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::bigint AS total_tokens,
       COALESCE(SUM(COALESCE(total_cost, 0)), 0)::numeric AS total_cost,
       COUNT(*)::int AS total_requests
     FROM usage_records
     ${clause} AND created_at >= NOW() - $${paramOffset + 1}::interval`,
    [...params, interval],
  );

  const row = result.rows[0];
  const currentUsage = {
    tokens: Number(row.total_tokens),
    costUsd: Number(row.total_cost),
    requests: Number(row.total_requests),
  };

  let percentUsed = 0;
  let allowed = true;

  if (limit.maxTokens && limit.maxTokens > 0) {
    const tokenPercent = (currentUsage.tokens / limit.maxTokens) * 100;
    percentUsed = Math.max(percentUsed, tokenPercent);
    if (currentUsage.tokens >= limit.maxTokens) allowed = false;
  }

  if (limit.maxCostUsd && limit.maxCostUsd > 0) {
    const costPercent = (currentUsage.costUsd / limit.maxCostUsd) * 100;
    percentUsed = Math.max(percentUsed, costPercent);
    if (currentUsage.costUsd >= limit.maxCostUsd) allowed = false;
  }

  if (limit.maxRequests && limit.maxRequests > 0) {
    const requestPercent = (currentUsage.requests / limit.maxRequests) * 100;
    percentUsed = Math.max(percentUsed, requestPercent);
    if (currentUsage.requests >= limit.maxRequests) allowed = false;
  }

  const warningTriggered = limit.notifyAt !== undefined && percentUsed >= limit.notifyAt;

  return {
    allowed,
    limit,
    currentUsage,
    percentUsed: Math.round(percentUsed * 100) / 100,
    warningTriggered,
  };
}

export async function checkAllLimitsForUser(
  tenantId: string,
  userId: string,
  department?: string,
): Promise<LimitCheckResult[]> {
  const limits = await getUsageLimits(tenantId);
  const results: LimitCheckResult[] = [];

  for (const limit of limits) {
    if (!limit.enabled) continue;

    const isRelevant =
      (limit.scope === "user" && limit.scopeId === userId) ||
      (limit.scope === "department" && department && limit.scopeId === department) ||
      limit.scope === "tenant";

    if (isRelevant) {
      results.push(await checkUsageLimit(tenantId, limit));
    }
  }

  return results;
}

export async function isUsageAllowed(
  tenantId: string,
  userId: string,
  department?: string,
): Promise<{ allowed: boolean; blockedBy?: LimitCheckResult }> {
  const results = await checkAllLimitsForUser(tenantId, userId, department);

  for (const result of results) {
    if (!result.allowed) {
      return { allowed: false, blockedBy: result };
    }
  }

  return { allowed: true };
}
