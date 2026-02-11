import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import type { TenantContext } from "../../context/tenant-context.js";
import { query } from "../../db/connection.js";
import { requirePermission } from "../../rbac/middleware.js";
import {
  maskApiKey,
  getTenantModelSettings,
  buildAnthropicClientOptions,
} from "../../services/llm/tenant-settings.js";
import { internalError } from "../errors.js";

const settings = new Hono();

// ---------------------------------------------------------------------------
// GET /settings - Retrieve merged tenant settings
// ---------------------------------------------------------------------------

settings.get("/", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;

  try {
    const result = await query<Record<string, unknown>>(
      `SELECT name, slug, plan, data_region, settings FROM tenants WHERE id = $1`,
      [ctx.tenantId],
    );

    const row = result.rows[0];
    if (!row) {
      return c.json({});
    }

    const stored = (row.settings as Record<string, unknown>) ?? {};

    // Mask API key before returning to the client
    if (typeof stored.anthropicApiKey === "string" && stored.anthropicApiKey) {
      stored.anthropicApiKey = maskApiKey(stored.anthropicApiKey);
    }

    return c.json({
      companyName: row.name as string,
      slug: row.slug as string,
      plan: row.plan as string,
      dataRegion: row.data_region as string,
      ...stored,
    });
  } catch (err) {
    console.error("[settings] get settings failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// PATCH /settings/:section - Update settings by section
// ---------------------------------------------------------------------------

const SECTIONS = ["organization", "security", "retention", "models", "notifications"] as const;

for (const section of SECTIONS) {
  settings.patch(`/${section}`, requirePermission("admin:config"), async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const body = await c.req.json();

    try {
      // For organization section, also update top-level tenant fields
      if (section === "organization") {
        const updates: string[] = [];
        const params: unknown[] = [];
        let idx = 1;

        if (body.companyName) {
          updates.push(`name = $${idx++}`);
          params.push(body.companyName);
        }
        if (body.dataRegion) {
          updates.push(`data_region = $${idx++}`);
          params.push(body.dataRegion);
        }
        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          params.push(ctx.tenantId);
          await query(`UPDATE tenants SET ${updates.join(", ")} WHERE id = $${idx}`, params);
        }
      }

      // For models section, strip masked API key to avoid overwriting the real one
      if (section === "models") {
        if (typeof body.anthropicApiKey === "string" && body.anthropicApiKey.startsWith("****")) {
          delete body.anthropicApiKey;
        }
      }

      // Merge body into settings JSONB
      await query(
        `UPDATE tenants SET settings = settings || $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(body), ctx.tenantId],
      );

      return c.json({ ok: true, section });
    } catch (err) {
      console.error(`[settings] update ${section} failed:`, err);
      return internalError(c);
    }
  });
}

// ---------------------------------------------------------------------------
// POST /settings/test-connection - Test Anthropic API key
// ---------------------------------------------------------------------------

settings.post("/test-connection", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;

  try {
    const body = await c.req.json().catch(() => ({}));
    let apiKey: string | undefined = body.apiKey;

    // If the key is masked, use the one stored in the database
    if (!apiKey || apiKey.startsWith("****")) {
      const tenantSettings = await getTenantModelSettings(ctx.tenantId);
      apiKey = tenantSettings.anthropicApiKey;
    }

    if (!apiKey) {
      return c.json({ success: false, error: "No API key provided" });
    }

    const anthropic = new Anthropic(buildAnthropicClientOptions(apiKey));

    await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      system: "You are Claude Code, Anthropic's official CLI for Claude.",
      messages: [{ role: "user", content: "hi" }],
    });

    return c.json({ success: true });
  } catch (err) {
    console.error("[settings] test connection failed:", err);
    const message = err instanceof Error ? err.message : "Connection failed";
    return c.json({ success: false, error: message });
  }
});

export { settings };
export const settingsRoutes = settings;
