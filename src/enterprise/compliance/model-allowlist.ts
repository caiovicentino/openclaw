import { query } from "../db/connection.js";

export type ModelAllowlistEntry = {
  provider: string;
  modelId: string;
  displayName?: string;
  maxTokensPerRequest?: number;
  costMultiplier?: number; // for internal chargeback (e.g., 1.2 = 20% overhead)
};

export type ModelAllowlistPolicy = {
  id: string;
  tenantId: string;
  entries: ModelAllowlistEntry[];
  defaultDeny: boolean; // if true, only listed models are allowed
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ModelAllowlistInput = Omit<ModelAllowlistPolicy, "id" | "createdAt" | "updatedAt">;

export async function getModelAllowlist(tenantId: string): Promise<ModelAllowlistPolicy | null> {
  const result = await query(
    `SELECT id, rules, enabled, created_at, updated_at
     FROM compliance_policies
     WHERE tenant_id = $1 AND type = 'model_allowlist'
     LIMIT 1`,
    [tenantId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const rules = row.rules as Record<string, unknown>;

  return {
    id: row.id as string,
    tenantId,
    entries: (rules.entries as ModelAllowlistEntry[]) ?? [],
    defaultDeny: (rules.defaultDeny as boolean) ?? false,
    enabled: row.enabled as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function setModelAllowlist(input: ModelAllowlistInput): Promise<ModelAllowlistPolicy> {
  // Upsert: delete existing then insert
  await query(`DELETE FROM compliance_policies WHERE tenant_id = $1 AND type = 'model_allowlist'`, [
    input.tenantId,
  ]);

  const result = await query(
    `INSERT INTO compliance_policies (tenant_id, name, type, rules, enabled)
     VALUES ($1, 'model-allowlist', 'model_allowlist', $2, $3)
     RETURNING id, created_at, updated_at`,
    [
      input.tenantId,
      JSON.stringify({
        entries: input.entries,
        defaultDeny: input.defaultDeny,
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

export async function addModelToAllowlist(
  tenantId: string,
  entry: ModelAllowlistEntry,
): Promise<void> {
  const policy = await getModelAllowlist(tenantId);
  if (!policy) {
    await setModelAllowlist({
      tenantId,
      entries: [entry],
      defaultDeny: true,
      enabled: true,
    });
    return;
  }

  // Replace if same provider+model exists, otherwise append
  const entries = policy.entries.filter(
    (e) => !(e.provider === entry.provider && e.modelId === entry.modelId),
  );
  entries.push(entry);

  await query(
    `UPDATE compliance_policies
     SET rules = jsonb_set(rules, '{entries}', $1::jsonb), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(entries), policy.id, tenantId],
  );
}

export async function removeModelFromAllowlist(
  tenantId: string,
  provider: string,
  modelId: string,
): Promise<void> {
  const policy = await getModelAllowlist(tenantId);
  if (!policy) return;

  const entries = policy.entries.filter((e) => !(e.provider === provider && e.modelId === modelId));

  await query(
    `UPDATE compliance_policies
     SET rules = jsonb_set(rules, '{entries}', $1::jsonb), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(entries), policy.id, tenantId],
  );
}

export function isModelAllowed(
  policy: ModelAllowlistPolicy | null,
  provider: string,
  modelId: string,
): { allowed: boolean; entry?: ModelAllowlistEntry } {
  // No policy or disabled policy = allow all
  if (!policy || !policy.enabled) {
    return { allowed: true };
  }

  const entry = policy.entries.find((e) => e.provider === provider && e.modelId === modelId);

  if (policy.defaultDeny) {
    // Only explicitly listed models are allowed
    return entry ? { allowed: true, entry } : { allowed: false };
  }

  // Default allow mode: listed entries are blocked
  return entry ? { allowed: false, entry } : { allowed: true };
}

export function getModelConfig(
  policy: ModelAllowlistPolicy | null,
  provider: string,
  modelId: string,
): ModelAllowlistEntry | undefined {
  if (!policy || !policy.enabled) return undefined;

  return policy.entries.find((e) => e.provider === provider && e.modelId === modelId);
}
