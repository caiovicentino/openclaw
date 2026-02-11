import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { exportAuditLog, type ExportFormat } from "../../audit/audit-export.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import {
  queryAuditLog,
  getAuditAggregations,
  type AuditQueryFilters,
} from "../../audit/audit-query.js";
import { auditStreamManager } from "../../audit/audit-stream.js";
import {
  createAlertRule,
  listAlertRules,
  updateAlertRule,
  deleteAlertRule,
  listAlerts,
  acknowledgeAlert,
} from "../../db/repositories/audit-alert-repo.js";
import { requirePermission } from "../../rbac/middleware.js";
import { badRequest, internalError, notFound } from "../errors.js";

const auditQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  severity: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  ipAddress: z.string().optional(),
  sessionKey: z.string().optional(),
  sortBy: z.enum(["created_at", "severity"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const auditExportQuerySchema = z.object({
  format: z.enum(["csv", "json", "ndjson"]).optional().default("csv"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  includeDetails: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v !== "false"),
  maxRows: z.coerce.number().int().min(1).optional(),
});

const auditStatsQuerySchema = z.object({
  period: z.enum(["hour", "day", "week", "month"]).optional().default("day"),
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

const alertsQuerySchema = z.object({
  acknowledged: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const audit = new Hono();

// ---------------------------------------------------------------------------
// GET /audit - Query audit log (admin:audit) with filters
// ---------------------------------------------------------------------------

audit.get(
  "/",
  requirePermission("admin:audit"),
  auditRoute({ action: "config.viewed", resourceType: "audit_log" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = auditQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const q = parsed.data;

    try {
      const filters: AuditQueryFilters = {
        tenantId: ctx.tenantId,
        userId: q.userId,
        action: q.action,
        resourceType: q.resourceType,
        severity: q.severity,
        startDate: q.startDate ? new Date(q.startDate) : undefined,
        endDate: q.endDate ? new Date(q.endDate) : undefined,
        search: q.search,
        ipAddress: q.ipAddress,
        sessionKey: q.sessionKey,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder,
        limit: q.limit,
        offset: q.offset,
      };

      const result = await queryAuditLog(filters);
      return c.json(result);
    } catch (err) {
      console.error("[audit] query audit log failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /audit/export - Export audit log (admin:audit:export)
// ---------------------------------------------------------------------------

audit.get(
  "/export",
  requirePermission("admin:audit:export"),
  auditRoute({ action: "privacy.data_exported", resourceType: "audit_log" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = auditExportQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const q = parsed.data;

    try {
      const result = await exportAuditLog({
        format: q.format,
        filters: {
          tenantId: ctx.tenantId,
          startDate: q.startDate ? new Date(q.startDate) : undefined,
          endDate: q.endDate ? new Date(q.endDate) : undefined,
        },
        includeDetails: q.includeDetails,
        maxRows: q.maxRows,
      });

      c.header("Content-Type", result.contentType);
      c.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return c.body(result.data);
    } catch (err) {
      console.error("[audit] export audit log failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /audit/stats - Aggregated stats (admin:audit)
// ---------------------------------------------------------------------------

audit.get(
  "/stats",
  requirePermission("admin:audit"),
  auditRoute({ action: "config.viewed", resourceType: "audit_stats" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = auditStatsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { period, days } = parsed.data;

    try {
      const aggregations = await getAuditAggregations(ctx.tenantId, period, days);
      return c.json({ period, days, aggregations });
    } catch (err) {
      console.error("[audit] get audit stats failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /audit/stream - SSE real-time audit events
// ---------------------------------------------------------------------------

audit.get("/stream", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;

  return streamSSE(c, async (stream) => {
    const unsubscribe = auditStreamManager.subscribe(ctx.tenantId, async (event) => {
      await stream.writeSSE({
        data: JSON.stringify(event),
      });
    });

    stream.onAbort(() => {
      unsubscribe();
    });

    // Keep connection alive
    while (true) {
      await stream.writeSSE({ data: JSON.stringify({ type: "ping" }) });
      await new Promise((r) => setTimeout(r, 30000));
    }
  });
});

// ---------------------------------------------------------------------------
// Alert Rules CRUD
// ---------------------------------------------------------------------------

audit.get("/alert-rules", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  try {
    const rules = await listAlertRules(ctx.tenantId);
    return c.json({ rules });
  } catch (err) {
    console.error("[audit] list alert rules failed:", err);
    return internalError(c);
  }
});

audit.post("/alert-rules", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  try {
    const body = await c.req.json();
    if (!body.name || !body.conditions) {
      return badRequest(c, "name and conditions are required");
    }
    const rule = await createAlertRule(ctx.tenantId, body);
    return c.json(rule, 201);
  } catch (err) {
    console.error("[audit] create alert rule failed:", err);
    return internalError(c);
  }
});

audit.patch("/alert-rules/:id", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const ruleId = c.req.param("id");
  try {
    const body = await c.req.json();
    const rule = await updateAlertRule(ctx.tenantId, ruleId, body);
    if (!rule) return notFound(c, "Alert rule");
    return c.json(rule);
  } catch (err) {
    console.error("[audit] update alert rule failed:", err);
    return internalError(c);
  }
});

audit.delete("/alert-rules/:id", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const ruleId = c.req.param("id");
  try {
    const deleted = await deleteAlertRule(ctx.tenantId, ruleId);
    if (!deleted) return notFound(c, "Alert rule");
    return c.body(null, 204);
  } catch (err) {
    console.error("[audit] delete alert rule failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

audit.get("/alerts", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const parsed = alertsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }
  const q = parsed.data;
  try {
    const result = await listAlerts(ctx.tenantId, {
      acknowledged: q.acknowledged,
      limit: q.limit,
      offset: q.offset,
    });
    return c.json(result);
  } catch (err) {
    console.error("[audit] list alerts failed:", err);
    return internalError(c);
  }
});

audit.post("/alerts/:id/acknowledge", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const alertId = c.req.param("id");
  try {
    const alert = await acknowledgeAlert(ctx.tenantId, alertId, ctx.userId);
    if (!alert) return notFound(c, "Alert");
    return c.json(alert);
  } catch (err) {
    console.error("[audit] acknowledge alert failed:", err);
    return internalError(c);
  }
});

export { audit };
export const auditRoutes = audit;
