import type { TenantContext } from "../context/tenant-context.js";
import { query } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Policy types
// ---------------------------------------------------------------------------

export type PolicyType =
  | "usage_limit"
  | "model_allowlist"
  | "content_filter"
  | "data_retention"
  | "ip_allowlist"
  | "time_restriction"
  | "custom";

export type PolicySeverity = "low" | "medium" | "high" | "critical";

export type CompliancePolicy = {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: PolicyType;
  rules: Record<string, unknown>;
  enabled: boolean;
  severity: PolicySeverity;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PolicyInput = {
  tenantId: string;
  name: string;
  description?: string;
  type: PolicyType;
  rules: Record<string, unknown>;
  enabled?: boolean;
  severity?: PolicySeverity;
  createdBy?: string;
};

// ---------------------------------------------------------------------------
// Evaluation result
// ---------------------------------------------------------------------------

export type PolicyViolation = {
  policyId: string;
  policyName: string;
  policyType: PolicyType;
  severity: PolicySeverity;
  message: string;
  details?: Record<string, unknown>;
};

export type EvaluationResult = {
  allowed: boolean;
  violations: PolicyViolation[];
  evaluatedPolicies: number;
  evaluationTimeMs: number;
};

// ---------------------------------------------------------------------------
// Evaluation context (what is being evaluated)
// ---------------------------------------------------------------------------

export type EvaluationContext = {
  tenantContext: TenantContext;
  action: string;
  resource?: string;
  content?: string;
  model?: { provider: string; modelId: string };
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Policy rule evaluators
// ---------------------------------------------------------------------------

type RuleEvaluator = (
  rules: Record<string, unknown>,
  evalCtx: EvaluationContext,
) => PolicyViolation | null;

function evaluateIpAllowlist(
  rules: Record<string, unknown>,
  evalCtx: EvaluationContext,
): PolicyViolation | null {
  const allowedIps = rules.allowedIps as string[] | undefined;
  const allowedCidrs = rules.allowedCidrs as string[] | undefined;
  const clientIp = evalCtx.tenantContext.ipAddress;

  if (!clientIp) return null;
  if (!allowedIps?.length && !allowedCidrs?.length) return null;

  if (allowedIps && allowedIps.includes(clientIp)) {
    return null;
  }

  if (allowedCidrs) {
    for (const cidr of allowedCidrs) {
      if (ipMatchesCidr(clientIp, cidr)) {
        return null;
      }
    }
  }

  return {
    policyId: "",
    policyName: "",
    policyType: "ip_allowlist",
    severity: "high",
    message: `IP address ${clientIp} is not in the allowlist`,
    details: { clientIp },
  };
}

function evaluateTimeRestriction(
  rules: Record<string, unknown>,
  _evalCtx: EvaluationContext,
): PolicyViolation | null {
  const allowedHoursStart = rules.allowedHoursStart as number | undefined;
  const allowedHoursEnd = rules.allowedHoursEnd as number | undefined;
  const timezone = (rules.timezone as string) ?? "UTC";
  const allowedDays = rules.allowedDays as number[] | undefined; // 0=Sun, 6=Sat

  if (allowedHoursStart === undefined && allowedHoursEnd === undefined && !allowedDays) {
    return null;
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const dayName = parts.find((p) => p.type === "weekday")?.value ?? "";

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayNum = dayMap[dayName] ?? 0;

  if (allowedDays && !allowedDays.includes(dayNum)) {
    return {
      policyId: "",
      policyName: "",
      policyType: "time_restriction",
      severity: "medium",
      message: `Access is not allowed on this day of the week`,
      details: { currentDay: dayNum, allowedDays },
    };
  }

  if (allowedHoursStart !== undefined && allowedHoursEnd !== undefined) {
    const inRange =
      allowedHoursStart <= allowedHoursEnd
        ? hour >= allowedHoursStart && hour < allowedHoursEnd
        : hour >= allowedHoursStart || hour < allowedHoursEnd;

    if (!inRange) {
      return {
        policyId: "",
        policyName: "",
        policyType: "time_restriction",
        severity: "medium",
        message: `Access is restricted outside business hours (${allowedHoursStart}:00-${allowedHoursEnd}:00 ${timezone})`,
        details: { currentHour: hour, allowedHoursStart, allowedHoursEnd, timezone },
      };
    }
  }

  return null;
}

function evaluateCustomPolicy(
  rules: Record<string, unknown>,
  evalCtx: EvaluationContext,
): PolicyViolation | null {
  const blockedActions = rules.blockedActions as string[] | undefined;
  const blockedResources = rules.blockedResources as string[] | undefined;
  const requiredPermissions = rules.requiredPermissions as string[] | undefined;

  if (blockedActions && evalCtx.action && blockedActions.includes(evalCtx.action)) {
    return {
      policyId: "",
      policyName: "",
      policyType: "custom",
      severity: "high",
      message: `Action "${evalCtx.action}" is blocked by policy`,
      details: { action: evalCtx.action },
    };
  }

  if (blockedResources && evalCtx.resource && blockedResources.includes(evalCtx.resource)) {
    return {
      policyId: "",
      policyName: "",
      policyType: "custom",
      severity: "high",
      message: `Resource "${evalCtx.resource}" is blocked by policy`,
      details: { resource: evalCtx.resource },
    };
  }

  if (requiredPermissions) {
    const userPerms = evalCtx.tenantContext.permissions;
    const hasWildcard = userPerms.includes("*");
    if (!hasWildcard) {
      const missing = requiredPermissions.filter((p) => !userPerms.includes(p));
      if (missing.length > 0) {
        return {
          policyId: "",
          policyName: "",
          policyType: "custom",
          severity: "high",
          message: `Missing required permissions: ${missing.join(", ")}`,
          details: { missingPermissions: missing },
        };
      }
    }
  }

  return null;
}

const RULE_EVALUATORS: Partial<Record<PolicyType, RuleEvaluator>> = {
  ip_allowlist: evaluateIpAllowlist,
  time_restriction: evaluateTimeRestriction,
  custom: evaluateCustomPolicy,
};

// ---------------------------------------------------------------------------
// CIDR matching utility
// ---------------------------------------------------------------------------

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [cidrBase, prefixStr] = cidr.split("/");
  if (!cidrBase || !prefixStr) return ip === cidr;
  const prefix = Number(prefixStr);
  if (Number.isNaN(prefix)) return false;

  const ipNum = ipToNumber(ip);
  const baseNum = ipToNumber(cidrBase);
  if (ipNum === null || baseNum === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (Number.isNaN(byte) || byte < 0 || byte > 255) return null;
    num = (num << 8) | byte;
  }
  return num >>> 0;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function createPolicy(input: PolicyInput): Promise<CompliancePolicy> {
  const result = await query(
    `INSERT INTO compliance_policies (tenant_id, name, description, type, rules, enabled, severity, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at, updated_at`,
    [
      input.tenantId,
      input.name,
      input.description ?? null,
      input.type,
      JSON.stringify(input.rules),
      input.enabled ?? true,
      input.severity ?? "medium",
      input.createdBy ?? null,
    ],
  );

  const row = result.rows[0];
  return {
    ...input,
    id: row.id as string,
    enabled: input.enabled ?? true,
    severity: input.severity ?? "medium",
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function getPolicy(id: string, tenantId: string): Promise<CompliancePolicy | null> {
  const result = await query(
    `SELECT id, tenant_id, name, description, type, rules, enabled, severity, created_by, created_at, updated_at
     FROM compliance_policies
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return rowToPolicy(row);
}

export async function getPolicies(
  tenantId: string,
  opts?: { type?: PolicyType; enabledOnly?: boolean },
): Promise<CompliancePolicy[]> {
  const conditions = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];

  if (opts?.type) {
    params.push(opts.type);
    conditions.push(`type = $${params.length}`);
  }
  if (opts?.enabledOnly) {
    conditions.push("enabled = true");
  }

  const result = await query(
    `SELECT id, tenant_id, name, description, type, rules, enabled, severity, created_by, created_at, updated_at
     FROM compliance_policies
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  );

  return result.rows.map(rowToPolicy);
}

export async function updatePolicy(
  id: string,
  tenantId: string,
  updates: Partial<
    Pick<CompliancePolicy, "name" | "description" | "rules" | "enabled" | "severity">
  >,
): Promise<void> {
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  let idx = 0;

  if (updates.name !== undefined) {
    params.push(updates.name);
    sets.push(`name = $${++idx}`);
  }
  if (updates.description !== undefined) {
    params.push(updates.description);
    sets.push(`description = $${++idx}`);
  }
  if (updates.rules !== undefined) {
    params.push(JSON.stringify(updates.rules));
    sets.push(`rules = $${++idx}`);
  }
  if (updates.enabled !== undefined) {
    params.push(updates.enabled);
    sets.push(`enabled = $${++idx}`);
  }
  if (updates.severity !== undefined) {
    params.push(updates.severity);
    sets.push(`severity = $${++idx}`);
  }

  params.push(id, tenantId);
  await query(
    `UPDATE compliance_policies SET ${sets.join(", ")} WHERE id = $${++idx} AND tenant_id = $${++idx}`,
    params,
  );
}

export async function deletePolicy(id: string, tenantId: string): Promise<void> {
  await query(`DELETE FROM compliance_policies WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

// ---------------------------------------------------------------------------
// Policy evaluation engine
// ---------------------------------------------------------------------------

export async function evaluatePolicies(evalCtx: EvaluationContext): Promise<EvaluationResult> {
  const start = Date.now();
  const tenantId = evalCtx.tenantContext.tenantId;

  const policies = await getPolicies(tenantId, { enabledOnly: true });
  const violations: PolicyViolation[] = [];

  for (const policy of policies) {
    const evaluator = RULE_EVALUATORS[policy.type];
    if (!evaluator) continue;

    const violation = evaluator(policy.rules, evalCtx);
    if (violation) {
      violations.push({
        ...violation,
        policyId: policy.id,
        policyName: policy.name,
        severity: policy.severity,
      });
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    evaluatedPolicies: policies.length,
    evaluationTimeMs: Date.now() - start,
  };
}

export function hasBlockingViolation(result: EvaluationResult): boolean {
  return result.violations.some((v) => v.severity === "high" || v.severity === "critical");
}

export function getViolationsByLevel(
  result: EvaluationResult,
  severity: PolicySeverity,
): PolicyViolation[] {
  return result.violations.filter((v) => v.severity === severity);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToPolicy(row: Record<string, unknown>): CompliancePolicy {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    type: row.type as PolicyType,
    rules: (row.rules as Record<string, unknown>) ?? {},
    enabled: row.enabled as boolean,
    severity: (row.severity as PolicySeverity) ?? "medium",
    createdBy: row.created_by as string | undefined,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
