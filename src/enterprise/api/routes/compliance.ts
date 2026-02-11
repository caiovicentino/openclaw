import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { getAuditLogger } from "../../audit/audit-logger.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import {
  createPolicy,
  getPolicy,
  getPolicies,
  updatePolicy,
  deletePolicy,
  type PolicyType,
  type PolicySeverity,
} from "../../compliance/policy-engine.js";
import { query } from "../../db/connection.js";
import { requirePermission } from "../../rbac/middleware.js";
import { badRequest, notFound, internalError } from "../errors.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const listPoliciesQuerySchema = z.object({
  type: z
    .enum(["content_filter", "rate_limit", "data_retention", "access_control", "audit"])
    .optional(),
  enabledOnly: z.enum(["true", "false"]).optional(),
});

const createPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["content_filter", "rate_limit", "data_retention", "access_control", "audit"]),
  rules: z.record(z.unknown()),
  enabled: z.boolean().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const updatePolicySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  rules: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const listViolationsQuerySchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const compliance = new Hono();

// ---------------------------------------------------------------------------
// Policies CRUD
// ---------------------------------------------------------------------------

/** GET /compliance/policies - List policies (admin:compliance) */
compliance.get(
  "/policies",
  requirePermission("admin:compliance"),
  auditRoute({ action: "config.viewed", resourceType: "compliance_policy" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = listPoliciesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const enabledOnly = parsed.data.enabledOnly === "true";

    try {
      const policies = await getPolicies(ctx.tenantId, {
        type: (parsed.data.type as PolicyType) || undefined,
        enabledOnly,
      });

      return c.json({ policies, total: policies.length });
    } catch (err) {
      console.error("[compliance] list policies failed:", err);
      return internalError(c);
    }
  },
);

/** POST /compliance/policies - Create policy (admin:compliance) */
compliance.post(
  "/policies",
  requirePermission("admin:compliance"),
  auditRoute({ action: "compliance.policy_created", resourceType: "compliance_policy" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const body = await c.req.json();
    const parsed = createPolicySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    try {
      const policy = await createPolicy({
        tenantId: ctx.tenantId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim(),
        type: parsed.data.type as PolicyType,
        rules: parsed.data.rules,
        enabled: parsed.data.enabled,
        severity: parsed.data.severity as PolicySeverity | undefined,
        createdBy: ctx.userId,
      });

      await getAuditLogger().logComplianceEvent(ctx.tenantId, "compliance.policy_created", {
        policyId: policy.id,
        policyName: policy.name,
        policyType: policy.type,
        createdBy: ctx.userId,
      });

      return c.json(policy, 201);
    } catch (err) {
      console.error("[compliance] create policy failed:", err);
      return internalError(c);
    }
  },
);

/** PATCH /compliance/policies/:id - Update policy (admin:compliance) */
compliance.patch(
  "/policies/:id",
  requirePermission("admin:compliance"),
  auditRoute({
    action: "compliance.policy_updated",
    resourceType: "compliance_policy",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const policyId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updatePolicySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    try {
      const existing = await getPolicy(policyId, ctx.tenantId);
      if (!existing) {
        return notFound(c, "Policy");
      }

      await updatePolicy(policyId, ctx.tenantId, {
        name: parsed.data.name?.trim(),
        description: parsed.data.description?.trim(),
        rules: parsed.data.rules,
        enabled: parsed.data.enabled,
        severity: parsed.data.severity as PolicySeverity | undefined,
      });

      await getAuditLogger().logComplianceEvent(ctx.tenantId, "compliance.policy_updated", {
        policyId,
        updatedBy: ctx.userId,
      });

      const updated = await getPolicy(policyId, ctx.tenantId);
      return c.json(updated);
    } catch (err) {
      console.error("[compliance] update policy failed:", err);
      return internalError(c);
    }
  },
);

/** DELETE /compliance/policies/:id - Delete policy (admin:compliance) */
compliance.delete(
  "/policies/:id",
  requirePermission("admin:compliance"),
  auditRoute({
    action: "compliance.policy_deleted",
    resourceType: "compliance_policy",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const policyId = c.req.param("id");

    try {
      const existing = await getPolicy(policyId, ctx.tenantId);
      if (!existing) {
        return notFound(c, "Policy");
      }

      await deletePolicy(policyId, ctx.tenantId);

      await getAuditLogger().logComplianceEvent(ctx.tenantId, "compliance.policy_deleted", {
        policyId,
        policyName: existing.name,
        deletedBy: ctx.userId,
      });

      return c.body(null, 204);
    } catch (err) {
      console.error("[compliance] delete policy failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// Violations
// ---------------------------------------------------------------------------

/** GET /compliance/violations - List violations (admin:compliance) */
compliance.get(
  "/violations",
  requirePermission("admin:compliance"),
  auditRoute({ action: "config.viewed", resourceType: "compliance_violation" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = listViolationsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { severity, startDate, endDate, limit, offset } = parsed.data;

    try {
      const conditions: string[] = ["tenant_id = $1", "action LIKE 'compliance.%'"];
      const params: unknown[] = [ctx.tenantId];
      let idx = 2;

      if (severity) {
        conditions.push(`severity = $${idx++}`);
        params.push(severity);
      }
      if (startDate) {
        conditions.push(`created_at >= $${idx++}`);
        params.push(new Date(startDate));
      }
      if (endDate) {
        conditions.push(`created_at <= $${idx++}`);
        params.push(new Date(endDate));
      }

      const where = `WHERE ${conditions.join(" AND ")}`;

      const countResult = await query(
        `SELECT COUNT(*)::int AS total FROM audit_log ${where}`,
        params,
      );
      const total: number = countResult.rows[0].total;

      params.push(limit, offset);
      const result = await query(
        `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        params,
      );

      const violations = result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        action: row.action,
        severity: row.severity,
        userId: row.user_id,
        details: row.details ?? {},
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      }));

      return c.json({ violations, total, limit, offset });
    } catch (err) {
      console.error("[compliance] list violations failed:", err);
      return internalError(c);
    }
  },
);

export { compliance };
export const complianceRoutes = compliance;
