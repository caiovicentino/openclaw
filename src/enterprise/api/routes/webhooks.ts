import { Hono } from "hono";
import { getAdapter } from "../../channels/adapter-registry.js";
import { routeIncomingMessage } from "../../channels/webhook-router.js";
import { query } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";

const webhooks = new Hono();

// Telegram webhook
webhooks.post("/telegram/:channelId", async (c) => {
  const channelId = c.req.param("channelId");
  const body = await c.req.json();
  const adapter = getAdapter("telegram");

  const message = adapter.parseIncomingMessage?.(body, {});
  if (!message) return c.json({ ok: true }); // Acknowledge but skip

  // Get channel config
  const result = await query("SELECT * FROM channels WHERE id = $1", [channelId]);
  if (result.rows.length === 0) return c.json({ error: "Channel not found" }, 404);
  const config = (result.rows[0].config ?? {}) as Record<string, unknown>;

  // Route async (don't block webhook response)
  routeIncomingMessage(channelId, message, adapter, config).catch((err) => {
    logger.error("Telegram webhook processing failed", { channelId, error: String(err) });
  });

  return c.json({ ok: true });
});

// Slack webhook (Events API)
webhooks.post("/slack/:channelId", async (c) => {
  const channelId = c.req.param("channelId");
  const body = await c.req.json();

  // Handle Slack URL verification challenge
  if ((body as Record<string, unknown>).type === "url_verification") {
    return c.json({ challenge: (body as Record<string, unknown>).challenge });
  }

  const adapter = getAdapter("slack");

  const message = adapter.parseIncomingMessage?.(body, {});
  if (!message) return c.json({ ok: true });

  const result = await query("SELECT * FROM channels WHERE id = $1", [channelId]);
  if (result.rows.length === 0) return c.json({ error: "Channel not found" }, 404);
  const config = (result.rows[0].config ?? {}) as Record<string, unknown>;

  routeIncomingMessage(channelId, message, adapter, config).catch((err) => {
    logger.error("Slack webhook processing failed", { channelId, error: String(err) });
  });

  return c.json({ ok: true });
});

// WhatsApp webhook
webhooks.post("/whatsapp/:channelId", async (c) => {
  const channelId = c.req.param("channelId");
  const body = await c.req.json();
  const adapter = getAdapter("whatsapp");

  const message = adapter.parseIncomingMessage?.(body, {});
  if (!message) return c.json({ ok: true });

  const result = await query("SELECT * FROM channels WHERE id = $1", [channelId]);
  if (result.rows.length === 0) return c.json({ error: "Channel not found" }, 404);
  const config = (result.rows[0].config ?? {}) as Record<string, unknown>;

  routeIncomingMessage(channelId, message, adapter, config).catch((err) => {
    logger.error("WhatsApp webhook processing failed", { channelId, error: String(err) });
  });

  return c.json({ ok: true });
});

// WhatsApp verification (GET) - required by Meta for webhook setup
webhooks.get("/whatsapp/:channelId", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (mode === "subscribe" && token) {
    return c.text(challenge ?? "");
  }
  return c.text("Forbidden", 403);
});

export { webhooks };
export const webhookRoutes = webhooks;
