import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { getSessionById, getTranscript } from "../../db/repositories/session-repo.js";
import {
  createShareToken,
  getShareByToken,
  listShareTokens,
  revokeShareToken,
} from "../../db/repositories/share-repo.js";
import { requirePermission } from "../../rbac/middleware.js";
import { exportAsMarkdown, exportAsJSON } from "../../services/export/conversation-exporter.js";
import { badRequest, notFound } from "../errors.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";

const share = new Hono();

// PUBLIC - no auth needed
share.get("/:token", async (c) => {
  const token = c.req.param("token");
  const shareToken = await getShareByToken(token);
  if (!shareToken) {
    return c.json({ error: "NOT_FOUND", message: "Share link not found or expired" }, 404);
  }

  const session = await getSessionById(shareToken.tenantId, shareToken.sessionId);
  if (!session) {
    return c.json({ error: "NOT_FOUND", message: "Conversation not found" }, 404);
  }

  const entries = await getTranscript(shareToken.tenantId, shareToken.sessionId, { limit: 1000 });
  const messages = entries
    .filter((e) => e.role === "user" || e.role === "assistant")
    .map((e) => ({
      role: e.role,
      content: e.content ?? "",
      createdAt: e.createdAt,
    }));

  const title = (session.sessionData as Record<string, unknown>)?.title ?? "Shared Conversation";

  return c.json({ title, messages, sharedAt: shareToken.createdAt });
});

// PROTECTED - require auth for creating/managing shares
share.use("/*", jwtAuthMiddleware());

const createShareSchema = z.object({
  includeToolOutputs: z.boolean().optional(),
  expiresInHours: z.number().min(1).max(720).optional(),
  maxViews: z.number().min(1).max(10000).optional(),
});

share.post("/sessions/:id/share", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const sessionId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = createShareSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, "Validation error", parsed.error.issues);

  const session = await getSessionById(ctx.tenantId, sessionId);
  if (!session || session.userId !== ctx.userId) {
    return notFound(c, "Session");
  }

  const shareToken = await createShareToken(ctx.tenantId, sessionId, ctx.userId, parsed.data);
  return c.json(
    {
      token: shareToken.token,
      url: `/shared/${shareToken.token}`,
      expiresAt: shareToken.expiresAt,
    },
    201,
  );
});

share.get("/sessions/:id/shares", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const sessionId = c.req.param("id");
  const shares = await listShareTokens(ctx.tenantId, sessionId);
  return c.json({ shares });
});

share.delete("/:id", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const tokenId = c.req.param("id");
  await revokeShareToken(ctx.tenantId, tokenId);
  return c.json({ ok: true });
});

// Export endpoints
share.get("/sessions/:id/export/:format", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const sessionId = c.req.param("id");
  const format = c.req.param("format");

  const session = await getSessionById(ctx.tenantId, sessionId);
  if (!session || session.userId !== ctx.userId) {
    return notFound(c, "Session");
  }

  const title = (session.sessionData as Record<string, unknown>)?.title ?? "Conversation";

  if (format === "markdown" || format === "md") {
    const md = await exportAsMarkdown(ctx.tenantId, sessionId, title, { includeToolOutputs: true });
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="${title}.md"`,
      },
    });
  } else if (format === "json") {
    const json = await exportAsJSON(ctx.tenantId, sessionId, title, { includeToolOutputs: true });
    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${title}.json"`,
      },
    });
  }

  return badRequest(c, "Invalid format. Use 'markdown' or 'json'");
});

export { share };
export const shareRoutes = share;
