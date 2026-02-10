import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { getAuditLogger } from "../../audit/audit-logger.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import { query } from "../../db/connection.js";
import { requirePermission, requireAnyPermission } from "../../rbac/middleware.js";
import { badRequest, notFound } from "../errors.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const listAgentsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
});

const createAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  tools: z.array(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  model: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  memory: z.string().optional(),
  projectInstructions: z.string().optional(),
  tools: z.array(z.unknown()).optional(),
  parameters: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  hooks: z.array(z.unknown()).optional(),
  skipToolApproval: z.boolean().optional(),
  enableTools: z.boolean().optional(),
  mcpServers: z.array(z.unknown()).optional(),
});

const updateSkillsSchema = z.object({
  skills: z.array(z.unknown()),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentConfigRow = {
  id: string;
  tenant_id: string;
  agent_id: string;
  config: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function rowToAgent(row: AgentConfigRow) {
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: (cfg.name as string) ?? "",
    description: (cfg.description as string | null) ?? null,
    model: (cfg.model as string) ?? "",
    systemPrompt: (cfg.systemPrompt as string | null) ?? null,
    memory: (cfg.memory as string | null) ?? null,
    projectInstructions: (cfg.projectInstructions as string | null) ?? null,
    tools: (cfg.tools as unknown[]) ?? [],
    parameters: (cfg.parameters as Record<string, unknown>) ?? {},
    hooks: (cfg.hooks as unknown[]) ?? [],
    isDefault: (cfg.isDefault as boolean) ?? false,
    skipToolApproval: (cfg.skipToolApproval as boolean) ?? false,
    enableTools: (cfg.enableTools as boolean) !== false,
    status: (cfg.status as string) ?? "active",
    mcpServers: (cfg.mcpServers as unknown[]) ?? [],
    createdBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const agents = new Hono();

/** GET /agents - List all agent configs (admin:agents or agent:chat) */
agents.get(
  "/",
  requireAnyPermission(["admin:agents", "agent:chat"]),
  auditRoute({ action: "config.viewed", resourceType: "agent" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = listAgentsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { status, search, limit, offset } = parsed.data;

    const conditions = ["tenant_id = $1"];
    const params: unknown[] = [ctx.tenantId];
    let idx = 2;

    if (status) {
      conditions.push(`config->>'status' = $${idx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(config->>'name' ILIKE $${idx} OR config->>'description' ILIKE $${idx})`);
      idx++;
      params.push(`%${search}%`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM agent_configs ${where}`,
      params,
    );

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM agent_configs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      params,
    );

    return c.json({
      agents: result.rows.map((r) => rowToAgent(r as AgentConfigRow)),
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  },
);

/** POST /agents - Create a new agent config (admin:agents) */
agents.post(
  "/",
  requirePermission("admin:agents"),
  auditRoute({ action: "config.agent_modified", resourceType: "agent" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const body = await c.req.json();
    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    const configData = {
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() ?? null,
      model: parsed.data.model.trim(),
      systemPrompt: parsed.data.systemPrompt ?? null,
      tools: parsed.data.tools ?? [],
      parameters: parsed.data.parameters ?? {},
      isDefault: parsed.data.isDefault ?? false,
      status: "active",
    };

    const result = await query(
      `INSERT INTO agent_configs (tenant_id, agent_id, config, updated_by)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING *`,
      [ctx.tenantId, `agent-${Date.now()}`, JSON.stringify(configData), ctx.userId],
    );

    return c.json(rowToAgent(result.rows[0] as AgentConfigRow), 201);
  },
);

/** GET /agents/:id - Get agent details (admin:agents) */
agents.get(
  "/:id",
  requirePermission("admin:agents"),
  auditRoute({
    action: "config.viewed",
    resourceType: "agent",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("id");

    const result = await query("SELECT * FROM agent_configs WHERE id = $1 AND tenant_id = $2", [
      agentId,
      ctx.tenantId,
    ]);

    if (result.rows.length === 0) {
      return notFound(c, "Agent config");
    }

    return c.json(rowToAgent(result.rows[0] as AgentConfigRow));
  },
);

/** PATCH /agents/:id/config - Update agent config (admin:agents) */
agents.patch(
  "/:id/config",
  requirePermission("admin:agents"),
  auditRoute({
    action: "config.agent_modified",
    resourceType: "agent",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateAgentSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    // Build a partial config object with only provided fields
    const patch: Record<string, unknown> = {};

    // Copy all validated fields into the JSONB patch
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      patch[key] =
        typeof value === "string" && ["name", "description", "model"].includes(key)
          ? (value as string).trim()
          : value;
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(c, "No fields to update");
    }

    const result = await query(
      `UPDATE agent_configs
       SET config = config || $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [JSON.stringify(patch), ctx.userId, agentId, ctx.tenantId],
    );

    if (result.rows.length === 0) {
      return notFound(c, "Agent config");
    }

    return c.json(rowToAgent(result.rows[0] as AgentConfigRow));
  },
);

/** PATCH /agents/:id - Update an agent config (alias, admin:agents) */
agents.patch(
  "/:id",
  requirePermission("admin:agents"),
  auditRoute({
    action: "config.agent_modified",
    resourceType: "agent",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateAgentSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    const patch: Record<string, unknown> = {};

    // Copy all validated fields into the JSONB patch
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      patch[key] =
        typeof value === "string" && ["name", "description", "model"].includes(key)
          ? (value as string).trim()
          : value;
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(c, "No fields to update");
    }

    const result = await query(
      `UPDATE agent_configs
       SET config = config || $1::jsonb, updated_at = NOW(), updated_by = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [JSON.stringify(patch), ctx.userId, agentId, ctx.tenantId],
    );

    if (result.rows.length === 0) {
      return notFound(c, "Agent config");
    }

    return c.json(rowToAgent(result.rows[0] as AgentConfigRow));
  },
);

/** GET /agents/:id/skills - List agent skills (skills:use) */
agents.get("/:id/skills", requirePermission("skills:use"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("id");

  const result = await query(
    "SELECT config->'tools' AS tools FROM agent_configs WHERE id = $1 AND tenant_id = $2",
    [agentId, ctx.tenantId],
  );

  if (result.rows.length === 0) {
    return notFound(c, "Agent");
  }

  return c.json({ agentId, skills: result.rows[0].tools ?? [] });
});

/** PATCH /agents/:id/skills - Update agent skills (skills:manage) */
agents.patch(
  "/:id/skills",
  requirePermission("skills:manage"),
  auditRoute({
    action: "config.agent_modified",
    resourceType: "agent",
    resourceId: (ctx) => ctx.params.id,
    details: () => ({ field: "skills" }),
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateSkillsSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    const result = await query(
      `UPDATE agent_configs
       SET config = jsonb_set(config, '{tools}', $1::jsonb), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING config->'tools' AS tools`,
      [JSON.stringify(parsed.data.skills), agentId, ctx.tenantId],
    );

    if (result.rows.length === 0) {
      return notFound(c, "Agent");
    }

    await getAuditLogger().logAdminAction(
      ctx.tenantId,
      ctx.userId,
      "config.agent_modified",
      "agent",
      agentId,
      { field: "skills", count: parsed.data.skills.length },
    );

    return c.json({ agentId, skills: result.rows[0].tools ?? [] });
  },
);

/** DELETE /agents/:id - Delete an agent config (admin:agents) */
agents.delete(
  "/:id",
  requirePermission("admin:agents"),
  auditRoute({
    action: "config.agent_modified",
    resourceType: "agent",
    resourceId: (ctx) => ctx.params.id,
    details: () => ({ operation: "delete" }),
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("id");

    const result = await query("DELETE FROM agent_configs WHERE id = $1 AND tenant_id = $2", [
      agentId,
      ctx.tenantId,
    ]);

    if ((result.rowCount ?? 0) === 0) {
      return notFound(c, "Agent config");
    }

    return c.json({ ok: true });
  },
);

export { agents };
export const agentRoutes = agents;
