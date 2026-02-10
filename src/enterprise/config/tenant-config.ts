import { query } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigLayer = "platform" | "tenant" | "agent" | "session";

export type TenantConfigOptions = {
  tenantId: string;
  agentId?: string;
  sessionKey?: string;
};

/** Platform-wide defaults that apply to every tenant unless overridden. */
export interface PlatformDefaults {
  maxTokens: number;
  defaultModel: string;
  maxSessionDuration: number;
  allowedTools: string[];
  enableMemory: boolean;
  enableAudit: boolean;
  rateLimitRpm: number;
  systemPromptPrefix: string;
}

/** Per-tenant configuration stored in `tenants.settings`. */
export interface TenantConfig {
  maxTokens?: number;
  defaultModel?: string;
  maxSessionDuration?: number;
  allowedTools?: string[];
  blockedTools?: string[];
  enableMemory?: boolean;
  enableAudit?: boolean;
  rateLimitRpm?: number;
  systemPromptPrefix?: string;
  customBranding?: {
    name?: string;
    logoUrl?: string;
    primaryColor?: string;
  };
  complianceMode?: string;
  dataRegion?: string;
}

/** Per-agent configuration stored in `agent_configs.config`. */
export interface AgentConfig {
  maxTokens?: number;
  model?: string;
  allowedTools?: string[];
  blockedTools?: string[];
  systemPromptPrefix?: string;
  temperature?: number;
  enableMemory?: boolean;
}

/** Per-session overrides (typically passed at session creation time). */
export interface SessionConfig {
  maxTokens?: number;
  model?: string;
  temperature?: number;
  systemPromptPrefix?: string;
}

/** Fully resolved configuration after merging all layers. */
export interface ResolvedConfig {
  maxTokens: number;
  model: string;
  maxSessionDuration: number;
  allowedTools: string[];
  blockedTools: string[];
  enableMemory: boolean;
  enableAudit: boolean;
  rateLimitRpm: number;
  systemPromptPrefix: string;
  temperature?: number;
  complianceMode?: string;
  dataRegion?: string;
}

// ---------------------------------------------------------------------------
// Platform defaults
// ---------------------------------------------------------------------------

const PLATFORM_DEFAULTS: PlatformDefaults = {
  maxTokens: 4096,
  defaultModel: "claude-sonnet-4-5-20250929",
  maxSessionDuration: 3600,
  allowedTools: ["bash", "read", "write", "edit", "glob", "grep", "browser"],
  enableMemory: true,
  enableAudit: true,
  rateLimitRpm: 60,
  systemPromptPrefix: "",
};

/**
 * Return a copy of the platform defaults.
 * Can be used by admin UIs to show what a "blank" tenant inherits.
 */
export function getPlatformDefaults(): PlatformDefaults {
  return { ...PLATFORM_DEFAULTS };
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

/** Load the tenant settings JSONB from the tenants table. */
export async function loadTenantConfig(tenantId: string): Promise<TenantConfig> {
  const result = await query<{ settings: TenantConfig }>(
    `SELECT settings FROM tenants WHERE id = $1`,
    [tenantId],
  );
  return (result.rows[0]?.settings as TenantConfig) ?? {};
}

/** Persist tenant settings back to the tenants table. */
export async function saveTenantConfig(tenantId: string, config: TenantConfig): Promise<void> {
  await query(`UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2`, [
    JSON.stringify(config),
    tenantId,
  ]);
}

/** Load the config JSONB for a specific agent within a tenant. */
export async function loadAgentConfig(tenantId: string, agentId: string): Promise<AgentConfig> {
  const result = await query<{ config: AgentConfig }>(
    `SELECT config FROM agent_configs WHERE tenant_id = $1 AND agent_id = $2`,
    [tenantId, agentId],
  );
  return (result.rows[0]?.config as AgentConfig) ?? {};
}

/** Persist agent config. Creates the row if it doesn't exist. */
export async function saveAgentConfig(
  tenantId: string,
  agentId: string,
  config: AgentConfig,
  updatedBy?: string,
): Promise<void> {
  await query(
    `INSERT INTO agent_configs (tenant_id, agent_id, config, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, agent_id) DO UPDATE
       SET config = $3, version = agent_configs.version + 1, updated_at = NOW(), updated_by = $4`,
    [tenantId, agentId, JSON.stringify(config), updatedBy ?? null],
  );
}

// ---------------------------------------------------------------------------
// Config resolution (layered merge)
// ---------------------------------------------------------------------------

/**
 * Merge configuration layers in order of precedence:
 *
 *     platform defaults  <  tenant config  <  agent config  <  session config
 *
 * Later layers override earlier ones for scalar values. For `allowedTools`,
 * the most specific non-empty list wins. `blockedTools` are accumulated
 * (union) across all layers so that a tenant can block tools without the
 * agent being able to unblock them.
 */
export function resolveConfig(
  tenant: TenantConfig = {},
  agent: AgentConfig = {},
  session: SessionConfig = {},
): ResolvedConfig {
  // ---- scalar merges (last-defined wins) ----
  const maxTokens =
    session.maxTokens ?? agent.maxTokens ?? tenant.maxTokens ?? PLATFORM_DEFAULTS.maxTokens;

  const model =
    session.model ?? agent.model ?? tenant.defaultModel ?? PLATFORM_DEFAULTS.defaultModel;

  const maxSessionDuration = tenant.maxSessionDuration ?? PLATFORM_DEFAULTS.maxSessionDuration;

  const enableMemory = agent.enableMemory ?? tenant.enableMemory ?? PLATFORM_DEFAULTS.enableMemory;

  const enableAudit = tenant.enableAudit ?? PLATFORM_DEFAULTS.enableAudit;

  const rateLimitRpm = tenant.rateLimitRpm ?? PLATFORM_DEFAULTS.rateLimitRpm;

  const temperature = session.temperature ?? agent.temperature;

  const systemPromptPrefix = [
    PLATFORM_DEFAULTS.systemPromptPrefix,
    tenant.systemPromptPrefix ?? "",
    agent.systemPromptPrefix ?? "",
    session.systemPromptPrefix ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  // ---- tool lists ----
  // Use the most specific non-empty allowedTools list.
  const allowedTools = agent.allowedTools?.length
    ? agent.allowedTools
    : tenant.allowedTools?.length
      ? tenant.allowedTools
      : [...PLATFORM_DEFAULTS.allowedTools];

  // blockedTools accumulate across layers
  const blockedTools = [...(tenant.blockedTools ?? []), ...(agent.blockedTools ?? [])];

  return {
    maxTokens,
    model,
    maxSessionDuration,
    allowedTools,
    blockedTools,
    enableMemory,
    enableAudit,
    rateLimitRpm,
    systemPromptPrefix,
    temperature,
    complianceMode: tenant.complianceMode,
    dataRegion: tenant.dataRegion,
  };
}

// ---------------------------------------------------------------------------
// Convenience: full resolution from DB
// ---------------------------------------------------------------------------

/**
 * Load tenant + agent configs from the database and resolve them with
 * optional session overrides.
 */
export async function getResolvedConfig(
  tenantId: string,
  agentId: string = "main",
  sessionOverrides: SessionConfig = {},
): Promise<ResolvedConfig> {
  const [tenantConfig, agentConfig] = await Promise.all([
    loadTenantConfig(tenantId),
    loadAgentConfig(tenantId, agentId),
  ]);

  return resolveConfig(tenantConfig, agentConfig, sessionOverrides);
}

/**
 * Given a resolved config, return the final tool list after applying blocks.
 */
export function getEffectiveTools(config: ResolvedConfig): string[] {
  const blocked = new Set(config.blockedTools.map((t) => t.toLowerCase()));
  return config.allowedTools.filter((t) => !blocked.has(t.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge an arbitrary number of config objects. Later layers override
 * earlier ones. Nested plain objects are merged recursively; all other
 * values (arrays, scalars, null) are replaced wholesale.
 */
export function mergeConfigs(...configs: Record<string, unknown>[]): Record<string, unknown> {
  if (configs.length === 0) return {};
  if (configs.length === 1) return structuredClone(configs[0]);

  const result: Record<string, unknown> = {};

  for (const config of configs) {
    for (const [key, value] of Object.entries(config)) {
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = mergeConfigs(result[key] as Record<string, unknown>, value);
      } else {
        result[key] = structuredClone(value);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Patch tenant config (partial update)
// ---------------------------------------------------------------------------

/**
 * Apply a partial update to the tenant config stored in the tenants table.
 * Merges the patch into the existing settings.
 */
export async function patchTenantConfig(
  tenantId: string,
  agentId: string,
  patch: Record<string, unknown>,
  updatedBy: string,
): Promise<void> {
  await query(
    `INSERT INTO agent_configs (tenant_id, agent_id, config, version, updated_by)
     VALUES ($1, $2, $3::jsonb, 1, $4)
     ON CONFLICT (tenant_id, agent_id)
     DO UPDATE SET
       config = agent_configs.config || $3::jsonb,
       version = agent_configs.version + 1,
       updated_at = NOW(),
       updated_by = COALESCE($4, agent_configs.updated_by)`,
    [tenantId, agentId, JSON.stringify(patch), updatedBy],
  );
}

// ---------------------------------------------------------------------------
// Compliance validation
// ---------------------------------------------------------------------------

type ComplianceRule = {
  field: string;
  operator: "eq" | "neq" | "in" | "notIn" | "exists" | "notExists";
  value?: unknown;
};

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!isPlainObject(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateRule(config: Record<string, unknown>, rule: ComplianceRule): boolean {
  const actual = getNestedValue(config, rule.field);

  switch (rule.operator) {
    case "eq":
      return actual === rule.value;
    case "neq":
      return actual !== rule.value;
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(actual);
    case "notIn":
      return Array.isArray(rule.value) && !rule.value.includes(actual);
    case "exists":
      return actual !== undefined;
    case "notExists":
      return actual === undefined;
    default:
      return true;
  }
}

/**
 * Validate a config change against active compliance policies of type
 * "config" for the given tenant. Returns a list of violations.
 */
export async function validateConfigChange(
  tenantId: string,
  newConfig: Record<string, unknown>,
): Promise<{ valid: boolean; violations: string[] }> {
  const violations: string[] = [];

  const result = await query(
    `SELECT name, rules FROM compliance_policies
     WHERE tenant_id = $1 AND type = 'config' AND enabled = true`,
    [tenantId],
  );

  for (const row of result.rows) {
    const policyName = row.name as string;
    const rules = row.rules as ComplianceRule[] | null;
    if (!Array.isArray(rules)) continue;

    for (const rule of rules) {
      if (!evaluateRule(newConfig, rule)) {
        violations.push(
          `Policy "${policyName}": field "${rule.field}" violates ${rule.operator} constraint`,
        );
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Config diff
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Compute the diff between two config objects. Returns an array of changes
 * with dotted paths, old values, and new values.
 */
export function diffConfigs(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): Array<{ path: string; oldValue: unknown; newValue: unknown }> {
  const changes: Array<{ path: string; oldValue: unknown; newValue: unknown }> = [];

  function walk(cur: Record<string, unknown>, prop: Record<string, unknown>, prefix: string): void {
    const allKeys = new Set([...Object.keys(cur), ...Object.keys(prop)]);

    for (const key of allKeys) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const oldVal = cur[key];
      const newVal = prop[key];

      if (isPlainObject(oldVal) && isPlainObject(newVal)) {
        walk(oldVal, newVal, fullPath);
      } else if (!deepEqual(oldVal, newVal)) {
        changes.push({ path: fullPath, oldValue: oldVal, newValue: newVal });
      }
    }
  }

  walk(current, proposed, "");
  return changes;
}
