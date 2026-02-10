import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { query } from "../../db/connection.js";
import { requirePermission } from "../../rbac/middleware.js";
import { McpClientManager, type McpServerConfig } from "../../services/mcp/client.js";
import { badRequest, notFound } from "../errors.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const addServerSchema = z
  .object({
    name: z.string().min(1).max(100),
    transport: z.enum(["stdio", "sse"]),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    env: z.record(z.string()).optional(),
  })
  .refine((d) => (d.transport === "stdio" && d.command) || (d.transport === "sse" && d.url), {
    message: "stdio requires command, sse requires url",
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadAgentConfig(
  tenantId: string,
  agentId: string,
): Promise<{ row: Record<string, unknown>; config: Record<string, unknown> } | null> {
  const result = await query<{ id: string; config: Record<string, unknown> | null }>(
    "SELECT id, config FROM agent_configs WHERE id = $1 AND tenant_id = $2",
    [agentId, tenantId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { row: row as unknown as Record<string, unknown>, config: row.config ?? {} };
}

async function saveMcpServers(
  tenantId: string,
  agentId: string,
  config: Record<string, unknown>,
  servers: McpServerConfig[],
): Promise<void> {
  const updatedConfig = { ...config, mcpServers: servers };
  await query(
    "UPDATE agent_configs SET config = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
    [JSON.stringify(updatedConfig), agentId, tenantId],
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const mcp = new Hono();

/** GET /mcp/agents/:agentId/servers - List MCP servers */
mcp.get("/agents/:agentId/servers", requirePermission("agent:update"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("agentId");

  const loaded = await loadAgentConfig(ctx.tenantId, agentId);
  if (!loaded) return notFound(c, "Agent");

  const servers = (loaded.config.mcpServers as McpServerConfig[]) ?? [];
  return c.json({ servers });
});

/** POST /mcp/agents/:agentId/servers - Add MCP server */
mcp.post("/agents/:agentId/servers", requirePermission("agent:update"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("agentId");
  const body = await c.req.json();

  const parsed = addServerSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  const loaded = await loadAgentConfig(ctx.tenantId, agentId);
  if (!loaded) return notFound(c, "Agent");

  const servers = (loaded.config.mcpServers as McpServerConfig[]) ?? [];
  const newServer: McpServerConfig = {
    id: crypto.randomUUID(),
    ...parsed.data,
  };
  servers.push(newServer);

  await saveMcpServers(ctx.tenantId, agentId, loaded.config, servers);

  return c.json({ server: newServer }, 201);
});

/** DELETE /mcp/agents/:agentId/servers/:serverId - Remove MCP server */
mcp.delete("/agents/:agentId/servers/:serverId", requirePermission("agent:update"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const agentId = c.req.param("agentId");
  const serverId = c.req.param("serverId");

  const loaded = await loadAgentConfig(ctx.tenantId, agentId);
  if (!loaded) return notFound(c, "Agent");

  const servers = (loaded.config.mcpServers as McpServerConfig[]) ?? [];
  const filtered = servers.filter((s) => s.id !== serverId);

  if (filtered.length === servers.length) {
    return notFound(c, "MCP Server");
  }

  await saveMcpServers(ctx.tenantId, agentId, loaded.config, filtered);
  return c.json({ ok: true });
});

/** POST /mcp/agents/:agentId/servers/:serverId/test - Test MCP connection */
mcp.post(
  "/agents/:agentId/servers/:serverId/test",
  requirePermission("agent:update"),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("agentId");
    const serverId = c.req.param("serverId");

    const loaded = await loadAgentConfig(ctx.tenantId, agentId);
    if (!loaded) return notFound(c, "Agent");

    const servers = (loaded.config.mcpServers as McpServerConfig[]) ?? [];
    const server = servers.find((s) => s.id === serverId);
    if (!server) return notFound(c, "MCP Server");

    const manager = new McpClientManager();
    try {
      await manager.connect(server);
      const tools = manager.getToolsForServer(server.id);
      await manager.disconnectAll();
      return c.json({
        ok: true,
        toolCount: tools.length,
        tools: tools.map((t) => ({ name: t.name, description: t.description })),
      });
    } catch (err) {
      await manager.disconnectAll();
      return c.json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

/** GET /mcp/agents/:agentId/servers/:serverId/tools - List tools from server */
mcp.get(
  "/agents/:agentId/servers/:serverId/tools",
  requirePermission("agent:update"),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const agentId = c.req.param("agentId");
    const serverId = c.req.param("serverId");

    const loaded = await loadAgentConfig(ctx.tenantId, agentId);
    if (!loaded) return notFound(c, "Agent");

    const servers = (loaded.config.mcpServers as McpServerConfig[]) ?? [];
    const server = servers.find((s) => s.id === serverId);
    if (!server) return notFound(c, "MCP Server");

    const manager = new McpClientManager();
    try {
      await manager.connect(server);
      const tools = manager.getToolsForServer(server.id);
      await manager.disconnectAll();
      return c.json({
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    } catch (err) {
      await manager.disconnectAll();
      return c.json({ tools: [], error: err instanceof Error ? err.message : String(err) });
    }
  },
);

export { mcp };
export const mcpRoutes = mcp;
