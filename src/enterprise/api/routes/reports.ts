import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import { getPolicies } from "../../compliance/policy-engine.js";
import { query } from "../../db/connection.js";
import { getUsageByTenant, getTopUsers, getDailyUsage } from "../../db/repositories/usage-repo.js";
import { requirePermission } from "../../rbac/middleware.js";
import { badRequest, internalError } from "../errors.js";

const reportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  groupBy: z.enum(["user", "department"]).optional().default("user"),
});

const costReportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const reports = new Hono();

// ---------------------------------------------------------------------------
// GET /reports/usage - Detailed usage report (admin:reports) with date range
// ---------------------------------------------------------------------------

reports.get(
  "/usage",
  requirePermission("admin:reports"),
  auditRoute({ action: "config.viewed", resourceType: "report_usage" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = reportQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { groupBy } = parsed.data;

    const start = parsed.data.startDate
      ? new Date(parsed.data.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = parsed.data.endDate ? new Date(parsed.data.endDate) : new Date();

    try {
      const daysDiff = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const [summary, topUsers, daily] = await Promise.all([
        getUsageByTenant(ctx.tenantId, { start, end }),
        getTopUsers(ctx.tenantId, { start, end }, 20),
        getDailyUsage(ctx.tenantId, daysDiff),
      ]);

      if (groupBy === "department") {
        const deptResult = await query(
          `SELECT
             u.department,
             COALESCE(SUM(ur.tokens_input), 0)::bigint AS tokens_input,
             COALESCE(SUM(ur.tokens_output), 0)::bigint AS tokens_output,
             COALESCE(SUM(ur.cost_usd), 0)::numeric AS cost_usd,
             COUNT(DISTINCT ur.user_id)::int AS unique_users
           FROM usage_records ur
           JOIN users u ON u.id = ur.user_id AND u.tenant_id = ur.tenant_id
           WHERE ur.tenant_id = $1 AND ur.created_at >= $2 AND ur.created_at <= $3
           GROUP BY u.department
           ORDER BY cost_usd DESC`,
          [ctx.tenantId, start, end],
        );

        const mappedDaily = daily.map((d) => ({
          date: d.date,
          tokensInput: d.tokensInput,
          tokensOutput: d.tokensOutput,
          costUsd: d.costUsd,
          sessions: d.uniqueUsers,
        }));

        return c.json({
          report: "usage",
          period: { start: start.toISOString(), end: end.toISOString() },
          summary,
          byDepartment: deptResult.rows.map((row: Record<string, unknown>) => ({
            department: row.department ?? "unassigned",
            tokensInput: Number(row.tokens_input),
            tokensOutput: Number(row.tokens_output),
            costUsd: Number(row.cost_usd),
            uniqueUsers: row.unique_users,
          })),
          dailyUsage: mappedDaily,
          generatedAt: new Date().toISOString(),
        });
      }

      const mappedDailyUser = daily.map((d) => ({
        date: d.date,
        tokensInput: d.tokensInput,
        tokensOutput: d.tokensOutput,
        costUsd: d.costUsd,
        sessions: d.uniqueUsers,
      }));

      return c.json({
        report: "usage",
        period: { start: start.toISOString(), end: end.toISOString() },
        summary,
        topUsers,
        dailyUsage: mappedDailyUser,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[reports] get usage report failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /reports/compliance - Compliance status report (admin:reports)
// ---------------------------------------------------------------------------

reports.get(
  "/compliance",
  requirePermission("admin:reports"),
  auditRoute({ action: "config.viewed", resourceType: "report_compliance" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;

    try {
      const [policies, violationsResult, dsarResult] = await Promise.all([
        getPolicies(ctx.tenantId),
        query(
          `SELECT severity, COUNT(*)::int AS count FROM audit_log
           WHERE tenant_id = $1 AND action LIKE 'compliance.%'
             AND created_at >= NOW() - INTERVAL '30 days'
           GROUP BY severity`,
          [ctx.tenantId],
        ),
        query(
          `SELECT status, COUNT(*)::int AS count FROM dsar_requests
           WHERE tenant_id = $1
           GROUP BY status`,
          [ctx.tenantId],
        ),
      ]);

      const enabledPolicies = policies.filter((p) => p.enabled);
      const disabledPolicies = policies.filter((p) => !p.enabled);

      const violationsBySeverity: Record<string, number> = {};
      for (const row of violationsResult.rows) {
        violationsBySeverity[row.severity as string] = row.count as number;
      }

      const dsarByStatus: Record<string, number> = {};
      for (const row of dsarResult.rows) {
        dsarByStatus[row.status as string] = row.count as number;
      }

      return c.json({
        report: "compliance",
        policies: {
          total: policies.length,
          enabled: enabledPolicies.length,
          disabled: disabledPolicies.length,
          byType: policies.reduce((acc: Record<string, number>, p) => {
            acc[p.type] = (acc[p.type] ?? 0) + 1;
            return acc;
          }, {}),
        },
        violations: {
          last30Days: violationsBySeverity,
          total: Object.values(violationsBySeverity).reduce((a, b) => a + b, 0),
        },
        dsar: dsarByStatus,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[reports] get compliance report failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /reports/cost - Cost analysis report (admin:reports)
// ---------------------------------------------------------------------------

reports.get(
  "/cost",
  requirePermission("admin:reports"),
  auditRoute({ action: "config.viewed", resourceType: "report_cost" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = costReportQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    const start = parsed.data.startDate
      ? new Date(parsed.data.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = parsed.data.endDate ? new Date(parsed.data.endDate) : new Date();

    try {
      const costDaysDiff = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const [summary, byModel, byUser, daily] = await Promise.all([
        getUsageByTenant(ctx.tenantId, { start, end }),
        query(
          `SELECT
             model_provider AS provider,
             model_id AS model,
             COALESCE(SUM(tokens_input), 0)::bigint AS tokens_input,
             COALESCE(SUM(tokens_output), 0)::bigint AS tokens_output,
             COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
             COUNT(*)::int AS request_count
           FROM usage_records
           WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
           GROUP BY model_provider, model_id
           ORDER BY cost_usd DESC`,
          [ctx.tenantId, start, end],
        ),
        getTopUsers(ctx.tenantId, { start, end }, 10),
        getDailyUsage(ctx.tenantId, costDaysDiff),
      ]);

      return c.json({
        report: "cost",
        period: { start: start.toISOString(), end: end.toISOString() },
        totalCostUsd: summary.totalCostUsd,
        totalTokensInput: summary.totalTokensInput,
        totalTokensOutput: summary.totalTokensOutput,
        byModel: byModel.rows.map((row: Record<string, unknown>) => ({
          provider: row.provider ?? "unknown",
          model: row.model ?? "unknown",
          tokensInput: Number(row.tokens_input),
          tokensOutput: Number(row.tokens_output),
          costUsd: Number(row.cost_usd),
          requestCount: row.request_count,
        })),
        topUsersByCost: byUser,
        dailyCost: daily.map((d) => ({
          date: d.date,
          costUsd: d.costUsd,
          tokensInput: d.tokensInput,
          tokensOutput: d.tokensOutput,
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[reports] get cost report failed:", err);
      return internalError(c);
    }
  },
);

export { reports };
export const reportRoutes = reports;
