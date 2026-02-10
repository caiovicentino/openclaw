import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { getAuditLogger } from "../../audit/audit-logger.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import {
  listSessions,
  getSessionById,
  updateSession,
  deleteSession,
  getTranscript,
} from "../../db/repositories/session-repo.js";
import { requirePermission, requireAnyPermission } from "../../rbac/middleware.js";
import { badRequest, forbidden, notFound } from "../errors.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const listSessionsQuerySchema = paginationSchema.extend({
  userId: z.string().optional(),
  agentId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

const transcriptQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const updateSessionSchema = z.object({
  status: z.enum(["active", "completed", "archived"]).optional(),
  sessionData: z.record(z.unknown()).optional(),
});

const sessions = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canViewAll(ctx: TenantContext): boolean {
  return ctx.permissions.includes("agent:view_all_history") || ctx.permissions.includes("*");
}

// ---------------------------------------------------------------------------
// List sessions
// ---------------------------------------------------------------------------

/**
 * GET /sessions - List sessions filtered by permissions:
 *   - agent:view_own_history -> only own sessions
 *   - agent:view_team_history -> department sessions
 *   - agent:view_all_history -> all sessions
 */
sessions.get(
  "/",
  requireAnyPermission([
    "agent:view_all_history",
    "agent:view_team_history",
    "agent:view_own_history",
  ]),
  auditRoute({ action: "session.accessed", resourceType: "session" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const viewAll = canViewAll(ctx);
    const canViewTeam = ctx.permissions.includes("agent:view_team_history");

    const parsed = listSessionsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { userId, agentId, status, search, limit, offset } = parsed.data;

    // Scope the query based on permissions
    const effectiveUserId = viewAll ? userId : canViewTeam ? userId : ctx.userId;

    const result = await listSessions(ctx.tenantId, {
      userId: effectiveUserId,
      agentId,
      status,
      search,
      limit,
      offset,
    });

    return c.json({
      sessions: result.sessions,
      total: result.total,
      limit,
      offset,
    });
  },
);

// ---------------------------------------------------------------------------
// Get single session
// ---------------------------------------------------------------------------

/** GET /sessions/:id - Session details */
sessions.get(
  "/:id",
  requireAnyPermission([
    "agent:view_all_history",
    "agent:view_team_history",
    "agent:view_own_history",
  ]),
  auditRoute({
    action: "session.accessed",
    resourceType: "session",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const sessionId = c.req.param("id");

    const session = await getSessionById(ctx.tenantId, sessionId);
    if (!session) {
      return notFound(c, "Session");
    }

    // Check ownership for non-admin users
    if (!canViewAll(ctx) && session.userId !== ctx.userId) {
      return forbidden(c, "Cannot view sessions belonging to other users");
    }

    return c.json(session);
  },
);

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

/** GET /sessions/:id/transcript - Full conversation transcript */
sessions.get(
  "/:id/transcript",
  requireAnyPermission([
    "agent:view_all_history",
    "agent:view_team_history",
    "agent:view_own_history",
  ]),
  auditRoute({
    action: "session.accessed",
    resourceType: "transcript",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const sessionId = c.req.param("id");
    const parsed = transcriptQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { limit, offset } = parsed.data;

    // Verify session exists and user has access
    const session = await getSessionById(ctx.tenantId, sessionId);
    if (!session) {
      return notFound(c, "Session");
    }

    if (!canViewAll(ctx) && session.userId !== ctx.userId) {
      return forbidden(c, "Cannot view transcripts for other users' sessions");
    }

    const entries = await getTranscript(ctx.tenantId, sessionId, { limit, offset });

    return c.json({
      sessionId,
      entries,
      limit,
      offset,
    });
  },
);

// ---------------------------------------------------------------------------
// Delete session
// ---------------------------------------------------------------------------

/** DELETE /sessions/:id - Delete session (agent:manage_sessions) */
sessions.delete(
  "/:id",
  requirePermission("agent:manage_sessions"),
  auditRoute({
    action: "session.deleted",
    resourceType: "session",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const sessionId = c.req.param("id");

    try {
      await deleteSession(ctx.tenantId, sessionId);
      await getAuditLogger().logAdminAction(
        ctx.tenantId,
        ctx.userId,
        "session.deleted",
        "session",
        sessionId,
        {},
      );
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return notFound(c, "Session");
      }
      throw err;
    }
  },
);

// ---------------------------------------------------------------------------
// Export session
// ---------------------------------------------------------------------------

/** POST /sessions/:id/export - Export session data (agent:export_history) */
sessions.post(
  "/:id/export",
  requirePermission("agent:export_history"),
  auditRoute({
    action: "session.exported",
    resourceType: "session",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const sessionId = c.req.param("id");

    const session = await getSessionById(ctx.tenantId, sessionId);
    if (!session) {
      return notFound(c, "Session");
    }

    // Non-admin users can only export their own sessions
    if (!canViewAll(ctx) && session.userId !== ctx.userId) {
      return forbidden(c, "Cannot export sessions belonging to other users");
    }

    const transcript = await getTranscript(ctx.tenantId, sessionId, { limit: 10000, offset: 0 });

    await getAuditLogger().logAdminAction(
      ctx.tenantId,
      ctx.userId,
      "session.exported",
      "session",
      sessionId,
      { entryCount: transcript.length },
    );

    return c.json({
      session,
      transcript,
      exportedAt: new Date().toISOString(),
      exportedBy: ctx.userId,
    });
  },
);

// ---------------------------------------------------------------------------
// Update session
// ---------------------------------------------------------------------------

/** PATCH /sessions/:id - Update session status or data */
sessions.patch(
  "/:id",
  requirePermission("agent:manage_sessions"),
  auditRoute({
    action: "session.accessed",
    resourceType: "session",
    resourceId: (ctx) => ctx.params.id,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const sessionId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    try {
      const updated = await updateSession(ctx.tenantId, sessionId, {
        status: parsed.data.status,
        sessionData: parsed.data.sessionData,
      });
      return c.json(updated);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return notFound(c, "Session");
      }
      throw err;
    }
  },
);

export { sessions };
export const sessionRoutes = sessions;
