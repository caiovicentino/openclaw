import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { query } from "../../db/connection.js";
import { requirePermission } from "../../rbac/middleware.js";
import { badRequest, notFound } from "../errors.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const createRuleSchema = z.object({
  sourceAgentId: z.string().uuid(),
  targetAgentId: z.string().uuid(),
  ruleType: z.enum(["handoff", "invoke"]),
  triggerDescription: z.string().optional(),
  contextSummaryPrompt: z.string().optional(),
  enabled: z.boolean().optional().default(true),
});

const updateRuleSchema = z.object({
  triggerDescription: z.string().optional(),
  contextSummaryPrompt: z.string().optional(),
  enabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const agentCollaboration = new Hono();

/** GET /agent-collaboration?agentId=<id> - List collaboration rules for an agent */
agentCollaboration.get("/", requirePermission("agent:read"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.query("agentId");

  let sql = `
      SELECT r.*,
        (SELECT config->>'name' FROM agent_configs WHERE id = r.source_agent_id) AS source_agent_name,
        (SELECT config->>'name' FROM agent_configs WHERE id = r.target_agent_id) AS target_agent_name
      FROM agent_collaboration_rules r
      WHERE r.tenant_id = $1
    `;
  const params: unknown[] = [ctx.tenantId];

  if (agentId) {
    sql += ` AND (r.source_agent_id = $2 OR r.target_agent_id = $2)`;
    params.push(agentId);
  }

  sql += ` ORDER BY r.created_at DESC`;

  const result = await query(sql, params);

  return c.json({
    rules: result.rows.map((r) => ({
      id: r.id,
      sourceAgentId: r.source_agent_id,
      sourceAgentName: r.source_agent_name,
      targetAgentId: r.target_agent_id,
      targetAgentName: r.target_agent_name,
      ruleType: r.rule_type,
      triggerDescription: r.trigger_description,
      contextSummaryPrompt: r.context_summary_prompt,
      enabled: r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

/** POST /agent-collaboration - Create a collaboration rule */
agentCollaboration.post("/", requirePermission("agent:write"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const body = await c.req.json();
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  const {
    sourceAgentId,
    targetAgentId,
    ruleType,
    triggerDescription,
    contextSummaryPrompt,
    enabled,
  } = parsed.data;

  if (sourceAgentId === targetAgentId) {
    return badRequest(c, "Source and target agents must be different");
  }

  const result = await query(
    `INSERT INTO agent_collaboration_rules (tenant_id, source_agent_id, target_agent_id, rule_type, trigger_description, context_summary_prompt, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
    [
      ctx.tenantId,
      sourceAgentId,
      targetAgentId,
      ruleType,
      triggerDescription ?? null,
      contextSummaryPrompt ?? null,
      enabled,
    ],
  );

  const r = result.rows[0];
  return c.json(
    {
      id: r.id,
      sourceAgentId: r.source_agent_id,
      targetAgentId: r.target_agent_id,
      ruleType: r.rule_type,
      triggerDescription: r.trigger_description,
      contextSummaryPrompt: r.context_summary_prompt,
      enabled: r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
    201,
  );
});

/** PATCH /agent-collaboration/:id - Update a collaboration rule */
agentCollaboration.patch("/:id", requirePermission("agent:write"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const ruleId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  // Build dynamic SET clause
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (parsed.data.triggerDescription !== undefined) {
    sets.push(`trigger_description = $${paramIdx++}`);
    params.push(parsed.data.triggerDescription);
  }
  if (parsed.data.contextSummaryPrompt !== undefined) {
    sets.push(`context_summary_prompt = $${paramIdx++}`);
    params.push(parsed.data.contextSummaryPrompt);
  }
  if (parsed.data.enabled !== undefined) {
    sets.push(`enabled = $${paramIdx++}`);
    params.push(parsed.data.enabled);
  }

  params.push(ruleId, ctx.tenantId);

  const result = await query(
    `UPDATE agent_collaboration_rules SET ${sets.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    return notFound(c, "Collaboration rule");
  }

  const r = result.rows[0];
  return c.json({
    id: r.id,
    sourceAgentId: r.source_agent_id,
    targetAgentId: r.target_agent_id,
    ruleType: r.rule_type,
    triggerDescription: r.trigger_description,
    contextSummaryPrompt: r.context_summary_prompt,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
});

/** DELETE /agent-collaboration/:id - Delete a collaboration rule */
agentCollaboration.delete("/:id", requirePermission("agent:write"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const ruleId = c.req.param("id");

  const result = await query(
    `DELETE FROM agent_collaboration_rules WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [ruleId, ctx.tenantId],
  );

  if (result.rows.length === 0) {
    return notFound(c, "Collaboration rule");
  }

  return c.json({ ok: true });
});

export { agentCollaboration };
export const agentCollaborationRoutes = agentCollaboration;
