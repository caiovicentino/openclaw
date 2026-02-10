import type { AuditEventType, AuditSeverity } from "./audit-events.js";
import { query } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Query filter types
// ---------------------------------------------------------------------------

export type AuditQueryFilters = {
  tenantId: string;
  userId?: string;
  action?: string | string[];
  resourceType?: string;
  severity?: string | string[];
  startDate?: Date;
  endDate?: Date;
  search?: string; // full-text search in details
  ipAddress?: string;
  sessionKey?: string;
  limit?: number; // default 50, max 1000
  offset?: number;
  sortBy?: "created_at" | "severity";
  sortOrder?: "asc" | "desc";
};

export type AuditQueryResult = {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type AuditEntry = {
  id: number;
  tenantId: string;
  userId: string | null;
  userName?: string; // joined from users table
  userEmail?: string; // joined from users table
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  sessionKey: string | null;
  severity: string;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToAuditEntry(row: Record<string, unknown>): AuditEntry {
  const entry: AuditEntry = {
    id: row.id as number,
    tenantId: row.tenant_id as string,
    userId: (row.user_id as string) ?? null,
    action: row.action as string,
    resourceType: (row.resource_type as string) ?? null,
    resourceId: (row.resource_id as string) ?? null,
    details: (row.details ?? {}) as Record<string, unknown>,
    ipAddress: (row.ip_address as string) ?? null,
    userAgent: (row.user_agent as string) ?? null,
    sessionKey: (row.session_key as string) ?? null,
    severity: row.severity as string,
    createdAt: new Date(row.created_at as string),
  };

  if (row.user_name != null) {
    entry.userName = row.user_name as string;
  }
  if (row.user_email != null) {
    entry.userEmail = row.user_email as string;
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Query function
// ---------------------------------------------------------------------------

/**
 * Query audit log entries with pagination and filters.
 * Builds dynamic SQL with parameterized queries based on filters.
 * LEFT JOINs the users table to get userName and userEmail.
 */
export async function queryAuditLog(filters: AuditQueryFilters): Promise<AuditQueryResult> {
  const conditions: string[] = ["a.tenant_id = $1"];
  const params: unknown[] = [filters.tenantId];
  let idx = 2;

  if (filters.userId) {
    conditions.push(`a.user_id = $${idx++}`);
    params.push(filters.userId);
  }

  if (filters.action) {
    if (Array.isArray(filters.action)) {
      if (filters.action.length > 0) {
        conditions.push(`a.action = ANY($${idx++})`);
        params.push(filters.action);
      }
    } else {
      conditions.push(`a.action = $${idx++}`);
      params.push(filters.action);
    }
  }

  if (filters.resourceType) {
    conditions.push(`a.resource_type = $${idx++}`);
    params.push(filters.resourceType);
  }

  if (filters.severity) {
    if (Array.isArray(filters.severity)) {
      if (filters.severity.length > 0) {
        conditions.push(`a.severity = ANY($${idx++})`);
        params.push(filters.severity);
      }
    } else {
      conditions.push(`a.severity = $${idx++}`);
      params.push(filters.severity);
    }
  }

  if (filters.startDate) {
    conditions.push(`a.created_at >= $${idx++}`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`a.created_at <= $${idx++}`);
    params.push(filters.endDate);
  }

  if (filters.ipAddress) {
    conditions.push(`a.ip_address = $${idx++}`);
    params.push(filters.ipAddress);
  }

  if (filters.sessionKey) {
    conditions.push(`a.session_key = $${idx++}`);
    params.push(filters.sessionKey);
  }

  if (filters.search) {
    conditions.push(`a.details::text ILIKE $${idx++}`);
    params.push(`%${filters.search}%`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  // Total count query
  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM audit_log a ${where}`,
    params,
  );
  const total: number = countResult.rows[0].total;

  // Pagination
  const limit = Math.min(Math.max(1, filters.limit ?? 50), 1000);
  const offset = Math.max(0, filters.offset ?? 0);

  // Sort - validate against allowlists to prevent SQL injection
  const allowedSortBy = ["created_at", "severity"] as const;
  const allowedSortOrder = ["asc", "desc"] as const;
  const sortBy = filters.sortBy ?? "created_at";
  const sortOrder = filters.sortOrder ?? "desc";
  if (!allowedSortBy.includes(sortBy as (typeof allowedSortBy)[number])) {
    throw new Error(`Invalid sortBy value: ${sortBy}`);
  }
  if (!allowedSortOrder.includes(sortOrder as (typeof allowedSortOrder)[number])) {
    throw new Error(`Invalid sortOrder value: ${sortOrder}`);
  }
  const orderClause = `ORDER BY a.${sortBy} ${sortOrder}`;

  // Data query with user join
  const dataParams = [...params, limit, offset];
  const result = await query(
    `SELECT a.*, u.name AS user_name, u.email AS user_email
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ${orderClause}
     LIMIT $${idx++} OFFSET $${idx++}`,
    dataParams,
  );

  return {
    entries: result.rows.map(rowToAuditEntry),
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

// ---------------------------------------------------------------------------
// Aggregation types and function
// ---------------------------------------------------------------------------

export type AuditAggregation = {
  period: string; // date string
  totalEvents: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  uniqueUsers: number;
};

/**
 * Get audit aggregations grouped by time period.
 */
export async function getAuditAggregations(
  tenantId: string,
  period: "hour" | "day" | "week" | "month",
  days: number = 30,
): Promise<AuditAggregation[]> {
  const truncUnit =
    period === "hour" ? "hour" : period === "day" ? "day" : period === "week" ? "week" : "month";

  // Get event counts grouped by period
  const totalResult = await query(
    `SELECT
       date_trunc($1, created_at) AS period,
       COUNT(*)::int AS total_events,
       COUNT(DISTINCT user_id)::int AS unique_users
     FROM audit_log
     WHERE tenant_id = $2 AND created_at >= NOW() - ($3 || ' days')::interval
     GROUP BY period
     ORDER BY period ASC`,
    [truncUnit, tenantId, String(days)],
  );

  // Get action breakdowns grouped by period
  const actionResult = await query(
    `SELECT
       date_trunc($1, created_at) AS period,
       action,
       COUNT(*)::int AS count
     FROM audit_log
     WHERE tenant_id = $2 AND created_at >= NOW() - ($3 || ' days')::interval
     GROUP BY period, action
     ORDER BY period ASC`,
    [truncUnit, tenantId, String(days)],
  );

  // Get severity breakdowns grouped by period
  const severityResult = await query(
    `SELECT
       date_trunc($1, created_at) AS period,
       severity,
       COUNT(*)::int AS count
     FROM audit_log
     WHERE tenant_id = $2 AND created_at >= NOW() - ($3 || ' days')::interval
     GROUP BY period, severity
     ORDER BY period ASC`,
    [truncUnit, tenantId, String(days)],
  );

  // Build action maps keyed by period string
  const actionMap = new Map<string, Record<string, number>>();
  for (const row of actionResult.rows) {
    const p = new Date(row.period as string).toISOString();
    if (!actionMap.has(p)) actionMap.set(p, {});
    actionMap.get(p)![row.action as string] = row.count as number;
  }

  // Build severity maps keyed by period string
  const severityMap = new Map<string, Record<string, number>>();
  for (const row of severityResult.rows) {
    const p = new Date(row.period as string).toISOString();
    if (!severityMap.has(p)) severityMap.set(p, {});
    severityMap.get(p)![row.severity as string] = row.count as number;
  }

  return totalResult.rows.map((row) => {
    const p = new Date(row.period as string).toISOString();
    return {
      period: p,
      totalEvents: row.total_events as number,
      byAction: actionMap.get(p) ?? {},
      bySeverity: severityMap.get(p) ?? {},
      uniqueUsers: row.unique_users as number,
    };
  });
}

// ---------------------------------------------------------------------------
// Convenience: fetch entries in batches (cursor-based pagination)
// ---------------------------------------------------------------------------

/**
 * Yields batches of audit entries matching filters using LIMIT+OFFSET
 * pagination. Each batch contains up to 1000 entries. This avoids loading
 * all entries into memory at once.
 */
export async function* fetchAuditEntriesBatched(
  tenantId: string,
  filters?: Omit<AuditQueryFilters, "tenantId">,
  maxEntries: number = 10_000,
): AsyncGenerator<AuditEntry[], void, undefined> {
  let currentOffset = 0;
  let fetched = 0;
  const batchSize = 1000;

  while (fetched < maxEntries) {
    const limit = Math.min(batchSize, maxEntries - fetched);
    const result = await queryAuditLog({
      ...filters,
      tenantId,
      limit,
      offset: currentOffset,
    });

    if (result.entries.length === 0) break;

    yield result.entries;
    fetched += result.entries.length;
    currentOffset += result.entries.length;

    if (!result.hasMore) break;
  }
}

/**
 * Fetch all audit entries matching filters (iterates all pages).
 * Use with caution for large datasets -- prefer fetchAuditEntriesBatched.
 */
export async function fetchAllAuditEntries(
  tenantId: string,
  filters?: Omit<AuditQueryFilters, "tenantId">,
  maxEntries: number = 10_000,
): Promise<AuditEntry[]> {
  const all: AuditEntry[] = [];

  for await (const batch of fetchAuditEntriesBatched(tenantId, filters, maxEntries)) {
    all.push(...batch);
  }

  return all;
}
