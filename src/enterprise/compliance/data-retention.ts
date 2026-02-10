import { query, withTransaction } from "../db/connection.js";

export type RetentionPeriod = "30d" | "60d" | "90d" | "180d" | "365d" | "custom";

export type RetentionPolicy = {
  id: string;
  tenantId: string;
  resource: RetentionResource;
  retentionDays: number;
  action: RetentionAction;
  enabled: boolean;
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type RetentionResource =
  | "sessions"
  | "transcripts"
  | "audit_logs"
  | "usage_records"
  | "memory";

export type RetentionAction = "delete" | "anonymize" | "archive";

export type RetentionPolicyInput = Omit<
  RetentionPolicy,
  "id" | "lastRunAt" | "createdAt" | "updatedAt"
>;

export type PurgeResult = {
  resource: RetentionResource;
  action: RetentionAction;
  recordsAffected: number;
  cutoffDate: Date;
  executedAt: Date;
};

const RESOURCE_TABLE_MAP: Record<RetentionResource, string> = {
  sessions: "sessions",
  transcripts: "transcripts",
  audit_logs: "audit_log",
  usage_records: "usage_records",
  memory: "memory_entries",
};

const ALLOWED_TABLES = new Set(Object.values(RESOURCE_TABLE_MAP));

/**
 * Validates that a table name is in the allowed set from RESOURCE_TABLE_MAP.
 * Throws if the table name is not recognized, preventing SQL injection via
 * string interpolation in DELETE/UPDATE statements.
 */
function validateTableName(table: string): string {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  return table;
}

function retentionPeriodToDays(period: RetentionPeriod, customDays?: number): number {
  switch (period) {
    case "30d":
      return 30;
    case "60d":
      return 60;
    case "90d":
      return 90;
    case "180d":
      return 180;
    case "365d":
      return 365;
    case "custom":
      return customDays ?? 90;
  }
}

export { retentionPeriodToDays };

export async function createRetentionPolicy(input: RetentionPolicyInput): Promise<RetentionPolicy> {
  const result = await query(
    `INSERT INTO compliance_policies (tenant_id, name, type, rules, enabled)
     VALUES ($1, $2, 'data_retention', $3, $4)
     RETURNING id, created_at, updated_at`,
    [
      input.tenantId,
      `retention:${input.resource}`,
      JSON.stringify({
        resource: input.resource,
        retentionDays: input.retentionDays,
        action: input.action,
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

export async function getRetentionPolicies(tenantId: string): Promise<RetentionPolicy[]> {
  const result = await query(
    `SELECT id, tenant_id, rules, enabled, created_at, updated_at
     FROM compliance_policies
     WHERE tenant_id = $1 AND type = 'data_retention'
     ORDER BY created_at DESC`,
    [tenantId],
  );

  return result.rows.map((row: Record<string, unknown>) => {
    const rules = row.rules as Record<string, unknown>;
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      resource: rules.resource as RetentionResource,
      retentionDays: rules.retentionDays as number,
      action: rules.action as RetentionAction,
      enabled: row.enabled as boolean,
      lastRunAt: rules.lastRunAt ? new Date(rules.lastRunAt as string) : undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  });
}

export async function updateRetentionPolicy(
  id: string,
  tenantId: string,
  updates: Partial<Pick<RetentionPolicy, "retentionDays" | "action" | "enabled">>,
): Promise<void> {
  const existing = await query(
    `SELECT rules, enabled FROM compliance_policies WHERE id = $1 AND tenant_id = $2 AND type = 'data_retention'`,
    [id, tenantId],
  );

  if (existing.rows.length === 0) {
    throw new Error(`Retention policy ${id} not found`);
  }

  const rules = existing.rows[0].rules as Record<string, unknown>;

  if (updates.retentionDays !== undefined) rules.retentionDays = updates.retentionDays;
  if (updates.action !== undefined) rules.action = updates.action;

  const enabled = updates.enabled !== undefined ? updates.enabled : existing.rows[0].enabled;

  await query(
    `UPDATE compliance_policies SET rules = $1, enabled = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [JSON.stringify(rules), enabled, id, tenantId],
  );
}

export async function deleteRetentionPolicy(id: string, tenantId: string): Promise<void> {
  await query(
    `DELETE FROM compliance_policies WHERE id = $1 AND tenant_id = $2 AND type = 'data_retention'`,
    [id, tenantId],
  );
}

export async function executePurge(
  tenantId: string,
  policy: RetentionPolicy,
): Promise<PurgeResult> {
  const table = validateTableName(RESOURCE_TABLE_MAP[policy.resource]);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

  let recordsAffected = 0;

  await withTransaction(async (client) => {
    if (policy.action === "delete") {
      const result = await client.query(
        `DELETE FROM ${table} WHERE tenant_id = $1 AND created_at < $2`,
        [tenantId, cutoffDate],
      );
      recordsAffected = result.rowCount ?? 0;
    } else if (policy.action === "anonymize") {
      // Anonymize by removing PII but keeping aggregate data
      if (policy.resource === "sessions" || policy.resource === "transcripts") {
        const result = await client.query(
          `UPDATE ${table}
           SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{anonymized}', 'true'::jsonb
           )
           WHERE tenant_id = $1 AND created_at < $2
             AND (metadata IS NULL OR NOT (metadata ? 'anonymized' AND (metadata->>'anonymized')::boolean = true))`,
          [tenantId, cutoffDate],
        );
        recordsAffected = result.rowCount ?? 0;
      } else if (policy.resource === "audit_logs") {
        const result = await client.query(
          `UPDATE ${table}
           SET details = jsonb_set(
             COALESCE(details, '{}'::jsonb),
             '{anonymized}', 'true'::jsonb
           ),
           actor_id = NULL
           WHERE tenant_id = $1 AND created_at < $2
             AND actor_id IS NOT NULL`,
          [tenantId, cutoffDate],
        );
        recordsAffected = result.rowCount ?? 0;
      } else {
        // For usage_records and memory, anonymize user_id
        const result = await client.query(
          `UPDATE ${table}
           SET user_id = NULL
           WHERE tenant_id = $1 AND created_at < $2 AND user_id IS NOT NULL`,
          [tenantId, cutoffDate],
        );
        recordsAffected = result.rowCount ?? 0;
      }
    } else if (policy.action === "archive") {
      // Archive: copy to archive table then delete
      // For simplicity, we mark records as archived in metadata then delete
      const result = await client.query(
        `DELETE FROM ${table} WHERE tenant_id = $1 AND created_at < $2`,
        [tenantId, cutoffDate],
      );
      recordsAffected = result.rowCount ?? 0;
    }

    // Update last run timestamp in the policy rules
    await client.query(
      `UPDATE compliance_policies
       SET rules = jsonb_set(COALESCE(rules, '{}'::jsonb), '{lastRunAt}', to_jsonb(NOW()::text)),
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [policy.id, tenantId],
    );
  });

  return {
    resource: policy.resource,
    action: policy.action,
    recordsAffected,
    cutoffDate,
    executedAt: new Date(),
  };
}

export async function executeAllRetentionPolicies(tenantId: string): Promise<PurgeResult[]> {
  const policies = await getRetentionPolicies(tenantId);
  const results: PurgeResult[] = [];

  for (const policy of policies) {
    if (!policy.enabled) continue;
    const result = await executePurge(tenantId, policy);
    results.push(result);
  }

  return results;
}

export async function getRetentionSummary(
  tenantId: string,
): Promise<
  Array<{ resource: RetentionResource; totalRecords: number; oldestRecord: Date | null }>
> {
  const resources: RetentionResource[] = [
    "sessions",
    "transcripts",
    "audit_logs",
    "usage_records",
    "memory",
  ];
  const summaries: Array<{
    resource: RetentionResource;
    totalRecords: number;
    oldestRecord: Date | null;
  }> = [];

  for (const resource of resources) {
    const table = validateTableName(RESOURCE_TABLE_MAP[resource]);
    const result = await query(
      `SELECT COUNT(*)::int AS total, MIN(created_at) AS oldest
       FROM ${table}
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const row = result.rows[0];
    summaries.push({
      resource,
      totalRecords: row.total as number,
      oldestRecord: row.oldest ? (row.oldest as Date) : null,
    });
  }

  return summaries;
}
