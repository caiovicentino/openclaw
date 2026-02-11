import type {
  CompliancePolicy,
  CompliancePolicyView,
  CreatePolicyRequest,
  UpdatePolicyRequest,
  PolicyFilters,
  ViolationFilters,
} from "./types";
import { client } from "./client";

function buildQuery(filters?: Record<string, unknown> | object): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Backend uses low/medium/high/critical; frontend SeverityBadge uses info/warning/error/critical
const backendToFrontendSeverity: Record<string, string> = {
  low: "info",
  medium: "warning",
  high: "error",
  critical: "critical",
};

const frontendToBackendSeverity: Record<string, string> = {
  info: "low",
  warning: "medium",
  error: "high",
  critical: "critical",
};

interface BackendPolicy {
  id: string;
  name: string;
  type: string;
  enabled?: boolean;
  active?: boolean;
  rules?: Record<string, unknown>;
  config?: Record<string, unknown>;
  updatedAt?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export async function getPolicies(
  filters?: PolicyFilters,
): Promise<{ items: CompliancePolicyView[]; total: number }> {
  const res = await client.get<{ policies: BackendPolicy[]; total: number }>(
    `/compliance/policies${buildQuery(filters)}`,
  );
  const policies: CompliancePolicyView[] = (res.policies ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    active: p.enabled ?? p.active ?? false,
    config: p.rules ?? p.config ?? {},
    updatedAt: p.updatedAt ?? p.updated_at ?? "",
  }));
  return { items: policies, total: res.total ?? 0 };
}

export async function getPolicy(id: string): Promise<CompliancePolicy> {
  return client.get<CompliancePolicy>(`/compliance/policies/${id}`);
}

export async function createPolicy(
  data: CreatePolicyRequest & { active?: boolean; config?: Record<string, unknown> },
): Promise<CompliancePolicy> {
  // Map frontend field names to backend: active->enabled, config->rules
  const payload = {
    ...data,
    enabled: data.enabled ?? data.active,
    rules: data.rules ?? data.config ?? {},
  };
  return client.post<CompliancePolicy>("/compliance/policies", payload);
}

export async function updatePolicy(
  id: string,
  data: UpdatePolicyRequest & { active?: boolean; config?: Record<string, unknown> },
): Promise<CompliancePolicy> {
  // Map frontend field names to backend: active->enabled, config->rules
  const payload = {
    ...data,
    enabled: data.enabled ?? data.active,
    rules: data.rules ?? data.config,
  };
  return client.patch<CompliancePolicy>(`/compliance/policies/${id}`, payload);
}

export async function deletePolicy(id: string): Promise<void> {
  return client.delete<void>(`/compliance/policies/${id}`);
}

interface BackendViolation {
  id: string;
  action?: string;
  severity?: string;
  userId?: string;
  userName?: string;
  policyName?: string;
  details?: Record<string, unknown> | string;
  createdAt?: string;
  timestamp?: string;
  actionTaken?: string;
  [key: string]: unknown;
}

interface MappedViolation {
  id: string;
  timestamp: string;
  userName: string;
  policyName: string;
  severity: string;
  details: string;
  actionTaken: string;
}

export async function getViolations(
  filters?: ViolationFilters & { page?: number; pageSize?: number; policyType?: string },
): Promise<{ items: MappedViolation[]; total: number; totalPages: number }> {
  const {
    page,
    pageSize,
    policyType: _policyType,
    severity: frontendSeverity,
    ...rest
  } = filters ?? {};
  const limit = pageSize ?? 20;
  const offset = page ? (page - 1) * limit : 0;
  // Map frontend severity to backend severity for the query filter
  const backendSeverity = frontendSeverity
    ? (frontendToBackendSeverity[frontendSeverity] ?? frontendSeverity)
    : undefined;
  const query = buildQuery({ ...rest, severity: backendSeverity, limit, offset });

  const res = await client.get<{
    violations: BackendViolation[];
    total: number;
    limit: number;
    offset: number;
  }>(`/compliance/violations${query}`);

  // Map backend fields to what CompliancePage ViolationsTab expects
  const items = (res.violations ?? []).map((v) => ({
    id: v.id,
    timestamp: v.timestamp ?? v.createdAt ?? "",
    userName: v.userName ?? v.userId ?? "Unknown",
    policyName: v.policyName ?? v.action?.replace("compliance.", "") ?? "Unknown",
    severity: backendToFrontendSeverity[v.severity ?? ""] ?? v.severity ?? "info",
    details: typeof v.details === "string" ? v.details : JSON.stringify(v.details ?? {}),
    actionTaken: v.actionTaken ?? "logged",
  }));

  const total = res.total ?? 0;
  return {
    items,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
