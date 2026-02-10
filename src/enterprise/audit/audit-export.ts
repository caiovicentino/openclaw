import { fetchAllAuditEntries, type AuditEntry, type AuditQueryFilters } from "./audit-query.js";

// ---------------------------------------------------------------------------
// Export format types
// ---------------------------------------------------------------------------

export type ExportFormat = "csv" | "json" | "ndjson";

export type ExportOptions = {
  format: ExportFormat;
  filters: AuditQueryFilters;
  includeDetails?: boolean; // include full details JSON
  maxRows?: number; // default 10000
};

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  "id",
  "timestamp",
  "tenant_id",
  "user_id",
  "user_name",
  "user_email",
  "action",
  "resource_type",
  "resource_id",
  "severity",
  "ip_address",
  "user_agent",
  "session_key",
  "details",
];

function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an audit entry to an array of CSV row values.
 */
export function formatAuditEntryForCsv(entry: AuditEntry): string[] {
  return [
    String(entry.id),
    entry.createdAt.toISOString(),
    entry.tenantId,
    entry.userId ?? "",
    entry.userName ?? "",
    entry.userEmail ?? "",
    entry.action,
    entry.resourceType ?? "",
    entry.resourceId ?? "",
    entry.severity,
    entry.ipAddress ?? "",
    entry.userAgent ?? "",
    entry.sessionKey ?? "",
    JSON.stringify(entry.details ?? {}),
  ];
}

function entriesToCsv(entries: AuditEntry[], includeDetails: boolean): string {
  const headers = includeDetails ? CSV_HEADERS : CSV_HEADERS.filter((h) => h !== "details");
  const header = headers.join(",");

  const rows = entries.map((e) => {
    let fields = formatAuditEntryForCsv(e);
    if (!includeDetails) {
      // Remove the last field (details)
      fields = fields.slice(0, -1);
    }
    return fields.map(escapeCsvField).join(",");
  });

  return [header, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// JSON / NDJSON helpers
// ---------------------------------------------------------------------------

function entriesToJson(entries: AuditEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

function entriesToNdjson(entries: AuditEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n");
}

// ---------------------------------------------------------------------------
// Filename generation
// ---------------------------------------------------------------------------

/**
 * Generate a filename for the export.
 * e.g., "audit-log-acme-corp-2026-02-05.csv"
 */
export function generateExportFilename(format: ExportFormat, tenantSlug: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const ext = format === "ndjson" ? "ndjson" : format;
  return `audit-log-${tenantSlug}-${date}.${ext}`;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

const CONTENT_TYPE_MAP: Record<ExportFormat, string> = {
  csv: "text/csv",
  json: "application/json",
  ndjson: "application/x-ndjson",
};

/**
 * Export audit log entries in the requested format.
 * CSV: standard columns with details as JSON string.
 * JSON: array of entries.
 * NDJSON: newline-delimited JSON (for SIEM ingestion).
 */
export async function exportAuditLog(
  options: ExportOptions,
): Promise<{ data: string; contentType: string; filename: string }> {
  const entries = await fetchAllAuditEntries(
    options.filters.tenantId,
    options.filters,
    options.maxRows ?? 10_000,
  );

  const includeDetails = options.includeDetails ?? true;
  let data: string;

  switch (options.format) {
    case "csv":
      data = entriesToCsv(entries, includeDetails);
      break;
    case "json":
      data = entriesToJson(entries);
      break;
    case "ndjson":
      data = entriesToNdjson(entries);
      break;
  }

  const contentType = CONTENT_TYPE_MAP[options.format];
  const filename = generateExportFilename(options.format, options.filters.tenantId);

  return { data, contentType, filename };
}
