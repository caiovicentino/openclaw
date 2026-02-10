import { Hono } from "hono";
import type { TenantContext } from "../../context/tenant-context.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import { query } from "../../db/connection.js";
import {
  getDailyUsage,
  getUsageByModel,
  getUsageByAgent,
  getSessionAnalytics,
  getUsageForecast,
} from "../../db/repositories/usage-repo.js";
import { requirePermission } from "../../rbac/middleware.js";
import { internalError } from "../errors.js";

const dashboard = new Hono();

// ---------------------------------------------------------------------------
// GET /dashboard/overview - Key metrics (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/overview",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;

    try {
      const [
        totalUsersResult,
        activeUsers24hResult,
        totalSessionsResult,
        tokensResult,
        violationsResult,
      ] = await Promise.all([
        // Total users
        query("SELECT COUNT(*)::int AS total FROM users WHERE tenant_id = $1", [ctx.tenantId]),
        // Active users in last 24h
        query(
          `SELECT COUNT(DISTINCT user_id)::int AS total FROM sessions
           WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
          [ctx.tenantId],
        ),
        // Total sessions
        query("SELECT COUNT(*)::int AS total FROM sessions WHERE tenant_id = $1", [ctx.tenantId]),
        // Tokens used today and cost
        query(
          `SELECT
             COALESCE(SUM(tokens_input), 0)::bigint AS tokens_input,
             COALESCE(SUM(tokens_output), 0)::bigint AS tokens_output,
             COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd
           FROM usage_records
           WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`,
          [ctx.tenantId],
        ),
        // Compliance violations (last 30 days)
        query(
          `SELECT COUNT(*)::int AS total FROM audit_log
           WHERE tenant_id = $1 AND action LIKE 'compliance.violation%'
             AND created_at >= NOW() - INTERVAL '30 days'`,
          [ctx.tenantId],
        ),
      ]);

      const tokensRow = tokensResult.rows[0];
      const tokensUsedToday = Number(tokensRow.tokens_input) + Number(tokensRow.tokens_output);

      return c.json({
        totalUsers: totalUsersResult.rows[0].total,
        activeUsers24h: activeUsers24hResult.rows[0].total,
        totalSessions: totalSessionsResult.rows[0].total,
        tokensUsedToday,
        costToday: Number(tokensRow.cost_usd),
        complianceViolations: violationsResult.rows[0].total,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard/usage - Usage chart data (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/usage",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard_usage" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const days = parseInt(c.req.query("days") ?? "30", 10);
    const effectiveDays = Math.min(Math.max(1, days), 365);

    try {
      const rawUsage = await getDailyUsage(ctx.tenantId, effectiveDays);

      // Normalize to match the DailyUsageData contract expected by the frontend
      const dailyUsage = rawUsage.map((row) => ({
        date: row.date,
        sessions: 0, // usage_records doesn't track sessions
        tokens: row.tokensInput + row.tokensOutput,
        cost: row.costUsd,
        activeUsers: row.uniqueUsers,
      }));

      return c.json({
        days: effectiveDays,
        dailyUsage,
      });
    } catch (err) {
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard/active-users - Active user breakdown (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/active-users",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard_users" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const period = c.req.query("period") ?? "7d";

    const intervalMap: Record<string, string> = {
      "24h": "24 hours",
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
    };
    const interval = intervalMap[period] ?? "7 days";

    try {
      const result = await query(
        `SELECT
           u.id AS user_id,
           u.name,
           u.email,
           u.department,
           COUNT(s.id)::int AS session_count,
           MAX(s.created_at) AS last_active
         FROM sessions s
         JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND s.created_at >= NOW() - $2::interval
         GROUP BY u.id, u.name, u.email, u.department
         ORDER BY session_count DESC
         LIMIT 100`,
        [ctx.tenantId, interval],
      );

      return c.json({
        period,
        users: result.rows.map((row: Record<string, unknown>) => ({
          userId: row.user_id,
          name: row.name,
          email: row.email,
          department: row.department,
          sessionCount: row.session_count,
          lastActive: row.last_active,
        })),
      });
    } catch (err) {
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard/top-agents - Most used agents (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/top-agents",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard_agents" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const limit = Math.min(parseInt(c.req.query("limit") ?? "10", 10), 50);
    const period = c.req.query("period") ?? "30d";

    const intervalMap: Record<string, string> = {
      "24h": "24 hours",
      "7d": "7 days",
      "30d": "30 days",
      "90d": "90 days",
    };
    const interval = intervalMap[period] ?? "30 days";

    try {
      const result = await query(
        `SELECT
           s.agent_id,
           a.name AS agent_name,
           a.model,
           COUNT(s.id)::int AS session_count,
           COUNT(DISTINCT s.user_id)::int AS unique_users
         FROM sessions s
         LEFT JOIN agent_configs a ON a.id = s.agent_id AND a.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1
           AND s.agent_id IS NOT NULL
           AND s.created_at >= NOW() - $2::interval
         GROUP BY s.agent_id, a.name, a.model
         ORDER BY session_count DESC
         LIMIT $3`,
        [ctx.tenantId, interval, limit],
      );

      return c.json({
        period,
        agents: result.rows.map((row: Record<string, unknown>) => ({
          agentId: row.agent_id,
          agentName: row.agent_name,
          model: row.model,
          sessionCount: row.session_count,
          uniqueUsers: row.unique_users,
        })),
      });
    } catch (err) {
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard/cost-breakdown - Cost by model & agent (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/cost-breakdown",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard_cost" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const start =
      c.req.query("start") ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const end = c.req.query("end") ?? new Date().toISOString().split("T")[0];

    try {
      const [byModel, byAgent] = await Promise.all([
        getUsageByModel(ctx.tenantId, start, end),
        getUsageByAgent(ctx.tenantId, start, end),
      ]);

      return c.json({ byModel, byAgent });
    } catch (err) {
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard/session-analytics - Session metrics over time (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/session-analytics",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard_sessions" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const start =
      c.req.query("start") ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const end = c.req.query("end") ?? new Date().toISOString().split("T")[0];

    try {
      const data = await getSessionAnalytics(ctx.tenantId, start, end);
      return c.json({ data });
    } catch (err) {
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard/usage-forecast - Daily cost for forecasting (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/usage-forecast",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard_forecast" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const days = Math.min(parseInt(c.req.query("days") ?? "30", 10), 365);

    try {
      const data = await getUsageForecast(ctx.tenantId, days);
      return c.json({ data });
    } catch (err) {
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /dashboard/agent-performance - Agent metrics (admin:dashboard)
// ---------------------------------------------------------------------------

dashboard.get(
  "/agent-performance",
  requirePermission("admin:dashboard"),
  auditRoute({ action: "config.viewed", resourceType: "dashboard_agent_perf" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const start =
      c.req.query("start") ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const end = c.req.query("end") ?? new Date().toISOString().split("T")[0];

    try {
      const data = await getUsageByAgent(ctx.tenantId, start, end);
      return c.json({ data });
    } catch (err) {
      return internalError(c);
    }
  },
);

export { dashboard };
export const dashboardRoutes = dashboard;
