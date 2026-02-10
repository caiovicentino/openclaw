import type {
  AuditEvent,
  AuditFilters,
  AuditStats,
  AuditAlertRule,
  AuditAlert,
  PaginatedResponse,
  ExportFormat,
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

export async function getAuditLogs(filters?: AuditFilters): Promise<PaginatedResponse<AuditEvent>> {
  const raw = await client.get<{
    entries: AuditEvent[];
    total: number;
    limit: number;
    offset: number;
  }>(`/audit${buildQuery(filters)}`);
  const limit = raw.limit ?? 50;
  const offset = raw.offset ?? 0;
  return {
    data: raw.entries ?? [],
    total: raw.total ?? 0,
    page: Math.floor(offset / limit) + 1,
    limit,
  };
}

export async function getAuditEvent(id: string): Promise<AuditEvent> {
  return client.get<AuditEvent>(`/audit/${id}`);
}

export async function exportAuditLogs(filters: AuditFilters, format: ExportFormat): Promise<Blob> {
  const query = buildQuery({ ...filters, format });
  const res = await client.raw("GET", `/audit/export${query}`);
  return res.blob();
}

export async function getAuditStats(filters?: AuditFilters): Promise<AuditStats> {
  const raw = await client.get<{
    period: string;
    days: number;
    aggregations: Array<{
      period: string;
      totalEvents: number;
      uniqueUsers: number;
      byAction: Record<string, number>;
      bySeverity: Record<string, number>;
    }>;
  }>(`/audit/stats${buildQuery(filters)}`);

  // Aggregate the time-bucketed data into the flat AuditStats shape the UI expects
  let totalEvents = 0;
  const eventsByAction: Record<string, number> = {};
  const eventsByResource: Record<string, number> = {};

  for (const bucket of raw.aggregations ?? []) {
    totalEvents += bucket.totalEvents ?? 0;
    for (const [action, count] of Object.entries(bucket.byAction ?? {})) {
      eventsByAction[action] = (eventsByAction[action] ?? 0) + count;
    }
    // Backend provides bySeverity; map into eventsByResource for the UI stats cards
    for (const [severity, count] of Object.entries(bucket.bySeverity ?? {})) {
      eventsByResource[severity] = (eventsByResource[severity] ?? 0) + count;
    }
  }

  return {
    totalEvents,
    eventsByAction,
    eventsByResource,
    topUsers: [],
  };
}

// ── Alert Rules ──────────────────────────────────────────────

export async function getAlertRules(): Promise<AuditAlertRule[]> {
  const raw = await client.get<{ rules: AuditAlertRule[] }>("/audit/alert-rules");
  return raw.rules ?? [];
}

export async function createAlertRule(data: {
  name: string;
  description?: string;
  conditions: Record<string, unknown>;
  enabled?: boolean;
}): Promise<AuditAlertRule> {
  return client.post<AuditAlertRule>("/audit/alert-rules", data);
}

export async function updateAlertRule(
  id: string,
  data: {
    name?: string;
    description?: string;
    conditions?: Record<string, unknown>;
    enabled?: boolean;
  },
): Promise<AuditAlertRule> {
  return client.patch<AuditAlertRule>(`/audit/alert-rules/${id}`, data);
}

export async function deleteAlertRule(id: string): Promise<void> {
  return client.delete(`/audit/alert-rules/${id}`);
}

// ── Alerts ───────────────────────────────────────────────────

export async function getAlerts(options?: {
  acknowledged?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditAlert[]; total: number }> {
  return client.get<{ entries: AuditAlert[]; total: number }>(
    `/audit/alerts${buildQuery(options)}`,
  );
}

export async function acknowledgeAlert(id: string): Promise<AuditAlert> {
  return client.post<AuditAlert>(`/audit/alerts/${id}/acknowledge`);
}
