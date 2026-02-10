import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
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

    const userId = c.req.query("userId");
    const action = c.req.query("action");
    const resourceType = c.req.query("resourceType");
    const severity = c.req.query("severity");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const search = c.req.query("search");
    const ipAddress = c.req.query("ipAddress");
    const sessionKey = c.req.query("sessionKey");
    const sortBy = c.req.query("sortBy") as "created_at" | "severity" | undefined;
    const sortOrder = c.req.query("sortOrder") as "asc" | "desc" | undefined;
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    try {
      const filters: AuditQueryFilters = {
        tenantId: ctx.tenantId,
        userId: userId || undefined,
        action: action || undefined,
        resourceType: resourceType || undefined,
        severity: severity || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        search: search || undefined,
        ipAddress: ipAddress || undefined,
        sessionKey: sessionKey || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      };

      const result = await queryAuditLog(filters);
      return c.json(result);
    } catch (err) {
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

    const format = (c.req.query("format") ?? "csv") as ExportFormat;
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    const includeDetails = c.req.query("includeDetails") !== "false";
    const maxRows = c.req.query("maxRows");

    if (!["csv", "json", "ndjson"].includes(format)) {
      return badRequest(c, "format must be csv, json, or ndjson");
    }

    try {
      const result = await exportAuditLog({
        format,
        filters: {
          tenantId: ctx.tenantId,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        },
        includeDetails,
        maxRows: maxRows ? parseInt(maxRows, 10) : undefined,
      });

      c.header("Content-Type", result.contentType);
      c.header("Content-Disposition", `attachment; filename="${result.filename}"`);
      return c.body(result.data);
    } catch (err) {
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

    const period = (c.req.query("period") ?? "day") as "hour" | "day" | "week" | "month";
    const days = parseInt(c.req.query("days") ?? "30", 10);

    if (!["hour", "day", "week", "month"].includes(period)) {
      return badRequest(c, "period must be hour, day, week, or month");
    }

    try {
      const aggregations = await getAuditAggregations(ctx.tenantId, period, days);
      return c.json({ period, days, aggregations });
    } catch (err) {
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
  } catch {
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
  } catch {
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
  } catch {
    return internalError(c);
  }
});

audit.delete("/alert-rules/:id", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const ruleId = c.req.param("id");
  try {
    const deleted = await deleteAlertRule(ctx.tenantId, ruleId);
    if (!deleted) return notFound(c, "Alert rule");
    return c.json({ success: true });
  } catch {
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

audit.get("/alerts", requirePermission("admin:audit"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const acknowledged = c.req.query("acknowledged");
  const limit = c.req.query("limit");
  const offset = c.req.query("offset");
  try {
    const result = await listAlerts(ctx.tenantId, {
      acknowledged: acknowledged !== undefined ? acknowledged === "true" : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return c.json(result);
  } catch {
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
  } catch {
    return internalError(c);
  }
});

export { audit };
export const auditRoutes = audit;
