import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { getAuditLogger } from "../../audit/audit-logger.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import { getAdapter } from "../../channels/adapter-registry.js";
import { baileysManager } from "../../channels/baileys-manager.js";
import { query } from "../../db/connection.js";
import { requirePermission } from "../../rbac/middleware.js";
import { badRequest, notFound } from "../errors.js";
import { createRateLimit, keyGenerators } from "../middleware/rate-limit-factory.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const listChannelsQuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
});

const createChannelSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  capabilities: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChannelRow = {
  id: string;
  tenant_id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  status: string;
  capabilities: unknown;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToChannel(row: ChannelRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type,
    name: row.name,
    config: row.config ?? {},
    status: row.status ?? "inactive",
    capabilities: row.capabilities ?? [],
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const channels = new Hono();

/** GET /channels - List channel status (admin:channels) */
channels.get(
  "/",
  requirePermission("admin:channels"),
  auditRoute({ action: "config.viewed", resourceType: "channel" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const parsed = listChannelsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { status, type } = parsed.data;

    const conditions = ["tenant_id = $1"];
    const params: unknown[] = [ctx.tenantId];
    let idx = 2;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (type) {
      conditions.push(`type = $${idx++}`);
      params.push(type);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await query(`SELECT * FROM channels ${where} ORDER BY created_at DESC`, params);

    return c.json({
      channels: result.rows.map((r) => rowToChannel(r as ChannelRow)),
      total: result.rows.length,
    });
  },
);

/** GET /channels/:id/config - Get channel config (admin:channels) */
channels.get(
  "/:id/config",
  requirePermission("admin:channels"),
  auditRoute({
    action: "config.viewed",
    resourceType: "channel",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");

    const result = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if (result.rows.length === 0) {
      return notFound(c, "Channel");
    }

    const channel = rowToChannel(result.rows[0] as ChannelRow);
    return c.json({
      channelId: channel.id,
      type: channel.type,
      name: channel.name,
      config: channel.config,
      capabilities: channel.capabilities,
      status: channel.status,
    });
  },
);

/** POST /channels/:id/connect - Connect channel (admin:channels) */
channels.post(
  "/:id/connect",
  requirePermission("admin:channels"),
  auditRoute({
    action: "config.channel_connected",
    resourceType: "channel",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");

    const existing = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if (existing.rows.length === 0) {
      return notFound(c, "Channel");
    }

    const result = await query(
      `UPDATE channels SET status = 'active', last_active_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [channelId, ctx.tenantId],
    );

    await getAuditLogger().logAdminAction(
      ctx.tenantId,
      ctx.userId,
      "config.channel_connected",
      "channel",
      channelId,
      { channelType: existing.rows[0].type },
    );

    return c.json(rowToChannel(result.rows[0] as ChannelRow));
  },
);

/** DELETE /channels/:id/disconnect - Disconnect channel (admin:channels) */
channels.delete(
  "/:id/disconnect",
  requirePermission("admin:channels"),
  auditRoute({
    action: "config.channel_disconnected",
    resourceType: "channel",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");

    const existing = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if (existing.rows.length === 0) {
      return notFound(c, "Channel");
    }

    const result = await query(
      `UPDATE channels SET status = 'inactive', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [channelId, ctx.tenantId],
    );

    await getAuditLogger().logAdminAction(
      ctx.tenantId,
      ctx.userId,
      "config.channel_disconnected",
      "channel",
      channelId,
      { channelType: existing.rows[0].type },
    );

    return c.json(rowToChannel(result.rows[0] as ChannelRow));
  },
);

/** GET /channels/:id - Get a single channel */
channels.get("/:id", requirePermission("admin:channels"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const channelId = c.req.param("id");

  const result = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
    channelId,
    ctx.tenantId,
  ]);

  if (result.rows.length === 0) {
    return notFound(c, "Channel");
  }

  return c.json(rowToChannel(result.rows[0] as ChannelRow));
});

/** POST /channels - Create a new channel */
channels.post(
  "/",
  requirePermission("admin:channels"),
  auditRoute({ action: "config.channel_connected", resourceType: "channel" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const body = await c.req.json();
    const parsed = createChannelSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    const result = await query(
      `INSERT INTO channels (tenant_id, type, name, config, capabilities, status)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'inactive')
       RETURNING *`,
      [
        ctx.tenantId,
        parsed.data.type.trim(),
        parsed.data.name.trim(),
        JSON.stringify(parsed.data.config ?? {}),
        JSON.stringify(parsed.data.capabilities ?? []),
      ],
    );

    return c.json(rowToChannel(result.rows[0] as ChannelRow), 201);
  },
);

/** PATCH /channels/:id - Update channel config or status */
channels.patch(
  "/:id",
  requirePermission("admin:channels"),
  auditRoute({
    action: "config.updated",
    resourceType: "channel",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateChannelSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (parsed.data.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(parsed.data.name.trim());
    }
    if (parsed.data.config !== undefined) {
      setClauses.push(`config = $${idx++}::jsonb`);
      params.push(JSON.stringify(parsed.data.config));
    }
    if (parsed.data.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      params.push(parsed.data.status);
    }
    if (parsed.data.capabilities !== undefined) {
      setClauses.push(`capabilities = $${idx++}::jsonb`);
      params.push(JSON.stringify(parsed.data.capabilities));
    }

    if (setClauses.length === 0) {
      return badRequest(c, "No fields to update");
    }

    setClauses.push("updated_at = NOW()");
    params.push(channelId, ctx.tenantId);

    const result = await query(
      `UPDATE channels SET ${setClauses.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      return notFound(c, "Channel");
    }

    return c.json(rowToChannel(result.rows[0] as ChannelRow));
  },
);

/** DELETE /channels/:id - Delete a channel */
channels.delete(
  "/:id",
  requirePermission("admin:channels"),
  auditRoute({
    action: "config.channel_disconnected",
    resourceType: "channel",
    resourceId: (ctx) => ctx.params.id,
    details: () => ({ operation: "delete" }),
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");

    const result = await query("DELETE FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if ((result.rowCount ?? 0) === 0) {
      return notFound(c, "Channel");
    }

    return c.body(null, 204);
  },
);

/** POST /channels/:id/test - Test channel connectivity */
channels.post(
  "/:id/test",
  requirePermission("admin:channels"),
  createRateLimit({ max: 10, windowMs: 60 * 1000, keyGenerator: keyGenerators.byTenant }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");

    const result = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if (result.rows.length === 0) {
      return notFound(c, "Channel");
    }

    const channel = result.rows[0] as ChannelRow;
    const adapter = getAdapter(channel.type);
    const configWithContext = { ...channel.config, _tenantId: ctx.tenantId, _channelId: channelId };
    const testResult = await adapter.testConnection(configWithContext);

    return c.json({
      channelId,
      channelType: channel.type,
      status: testResult.success ? "ok" : "error",
      message: testResult.message,
      latencyMs: testResult.latencyMs,
      details: testResult.details,
    });
  },
);

// ---------------------------------------------------------------------------
// WhatsApp Web QR Login Endpoints
// ---------------------------------------------------------------------------

/** POST /channels/:id/qr - Start QR login for whatsapp-web channel */
channels.post(
  "/:id/qr",
  requirePermission("admin:channels"),
  auditRoute({
    action: "config.whatsapp_qr_started",
    resourceType: "channel",
    resourceId: (ctx) => ctx.params.id,
  }),
  createRateLimit({ max: 5, windowMs: 60 * 1000, keyGenerator: keyGenerators.byTenant }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");

    const result = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if (result.rows.length === 0) {
      return notFound(c, "Channel");
    }

    const channel = result.rows[0] as ChannelRow;
    if (channel.type !== "whatsapp-web") {
      return badRequest(c, "QR login is only available for whatsapp-web channels");
    }

    const login = await baileysManager.startQrLogin(ctx.tenantId, channelId);
    return c.json(login);
  },
);

/** GET /channels/:id/qr-status - Poll QR login status */
channels.get(
  "/:id/qr-status",
  requirePermission("admin:channels"),
  createRateLimit({ max: 60, windowMs: 60 * 1000, keyGenerator: keyGenerators.byTenant }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");
    const loginId = c.req.query("loginId") ?? "";

    const result = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if (result.rows.length === 0) {
      return notFound(c, "Channel");
    }

    const channel = result.rows[0] as ChannelRow;
    if (channel.type !== "whatsapp-web") {
      return badRequest(c, "QR status is only available for whatsapp-web channels");
    }

    const status = baileysManager.getLoginStatus(ctx.tenantId, channelId, loginId);
    return c.json(status);
  },
);

/** POST /channels/:id/qr-disconnect - Disconnect whatsapp-web channel */
channels.post(
  "/:id/qr-disconnect",
  requirePermission("admin:channels"),
  auditRoute({
    action: "config.whatsapp_qr_disconnected",
    resourceType: "channel",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const channelId = c.req.param("id");

    const result = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    if (result.rows.length === 0) {
      return notFound(c, "Channel");
    }

    const channel = result.rows[0] as ChannelRow;
    if (channel.type !== "whatsapp-web") {
      return badRequest(c, "QR disconnect is only available for whatsapp-web channels");
    }

    await baileysManager.disconnect(ctx.tenantId, channelId);

    // Refetch updated channel
    const updated = await query("SELECT * FROM channels WHERE id = $1 AND tenant_id = $2", [
      channelId,
      ctx.tenantId,
    ]);

    return c.json(rowToChannel(updated.rows[0] as ChannelRow));
  },
);

export { channels };
export const channelRoutes = channels;
