import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { getAuditLogger } from "../../audit/audit-logger.js";
import { auditRoute } from "../../audit/audit-middleware.js";
import { listBreaches } from "../../privacy/breach-notifier.js";
import {
  listUserConsents,
  listTenantConsents,
  grantConsent,
  revokeConsent,
  type ConsentPurpose,
} from "../../privacy/consent-manager.js";
import {
  createDsarRequest,
  getDsarRequest,
  listDsarRequests,
  updateDsarStatus,
  type DsarRequestType,
  type DsarStatus,
} from "../../privacy/dsar-handler.js";
import { eraseUserData } from "../../privacy/erasure-handler.js";
import { exportUserData } from "../../privacy/portability-handler.js";
import { requirePermission, requireAnyPermission } from "../../rbac/middleware.js";
import { badRequest, forbidden, notFound, internalError } from "../errors.js";
import { createRateLimit, keyGenerators } from "../middleware/rate-limit-factory.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const dsarSchema = z.object({
  userId: z.string().optional(),
  requestType: z.enum(["access", "rectification", "erasure", "portability", "restriction"]),
  details: z.record(z.unknown()).optional(),
});

const erasureSchema = z.object({
  userId: z.string().min(1),
  confirm: z.literal(true),
});

const dsarListQuerySchema = z.object({
  status: z.string().optional(),
  userId: z.string().optional(),
});

const dsarUpdateSchema = z.object({
  status: z.string().min(1),
  response: z.string().optional(),
});

const consentSchema = z.object({
  purpose: z.enum([
    "data_processing",
    "ai_training",
    "analytics",
    "marketing",
    "third_party_sharing",
    "cross_border_transfer",
  ]),
  granted: z.boolean(),
  version: z.string().optional(),
});

const privacy = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if the current user can act on behalf of another user. */
function canActOnUser(ctx: TenantContext, targetUserId: string): boolean {
  return (
    ctx.userId === targetUserId ||
    ctx.permissions.includes("admin:compliance") ||
    ctx.permissions.includes("*")
  );
}

// ---------------------------------------------------------------------------
// DSAR routes
// ---------------------------------------------------------------------------

/** POST /privacy/dsar - Submit DSAR (admin:compliance or self) */
privacy.post(
  "/dsar",
  requireAnyPermission(["admin:compliance", "agent:chat"]),
  createRateLimit({ max: 3, windowMs: 24 * 60 * 60 * 1000, keyGenerator: keyGenerators.byUser }),
  auditRoute({ action: "privacy.dsar_submitted", resourceType: "dsar" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const body = await c.req.json();
    const parsed = dsarSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    const targetUserId = parsed.data.userId ?? ctx.userId;

    if (!canActOnUser(ctx, targetUserId)) {
      return forbidden(c, "Cannot submit DSAR for another user");
    }

    try {
      const request = await createDsarRequest({
        tenantId: ctx.tenantId,
        userId: targetUserId,
        requestType: parsed.data.requestType as DsarRequestType,
        details: parsed.data.details,
      });

      await getAuditLogger().logComplianceEvent(ctx.tenantId, "privacy.dsar_submitted", {
        dsarId: request.id,
        requestType: request.requestType,
        targetUserId,
        submittedBy: ctx.userId,
      });

      return c.json(request, 201);
    } catch (err) {
      console.error("[privacy] submit DSAR failed:", err);
      return internalError(c);
    }
  },
);

/** GET /privacy/dsar - List DSAR requests for the tenant */
privacy.get("/dsar", requirePermission("admin:compliance"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const parsed = dsarListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }
  const status = parsed.data.status as DsarStatus | undefined;
  const userId = parsed.data.userId;

  try {
    const requests = await listDsarRequests(ctx.tenantId, { status, userId });
    return c.json(requests);
  } catch (err) {
    console.error("[privacy] list DSAR requests failed:", err);
    return internalError(c);
  }
});

/** PATCH /privacy/dsar/:id - Update DSAR request status */
privacy.patch(
  "/dsar/:id",
  requirePermission("admin:compliance"),
  auditRoute({ action: "privacy.dsar_updated", resourceType: "dsar" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const requestId = c.req.param("id");
    const body = await c.req.json();
    const parsed = dsarUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    try {
      const updated = await updateDsarStatus(
        ctx.tenantId,
        requestId,
        parsed.data.status as DsarStatus,
        parsed.data.response,
        ctx.userId,
      );

      if (!updated) {
        return notFound(c, "DSAR request");
      }

      await getAuditLogger().logComplianceEvent(ctx.tenantId, "privacy.dsar_updated", {
        dsarId: requestId,
        newStatus: parsed.data.status,
        updatedBy: ctx.userId,
      });

      return c.json(updated);
    } catch (err) {
      console.error("[privacy] update DSAR status failed:", err);
      return internalError(c);
    }
  },
);

/** GET /privacy/dsar/:id - DSAR status */
privacy.get("/dsar/:id", requireAnyPermission(["admin:compliance", "agent:chat"]), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const requestId = c.req.param("id");

  try {
    const request = await getDsarRequest(ctx.tenantId, requestId);
    if (!request) {
      return notFound(c, "DSAR request");
    }

    // Non-admin users can only view their own requests
    if (!canActOnUser(ctx, request.userId)) {
      return forbidden(c, "Cannot view DSAR for another user");
    }

    return c.json(request);
  } catch (err) {
    console.error("[privacy] get DSAR request failed:", err);
    return internalError(c);
  }
});

// ---------------------------------------------------------------------------
// Erasure
// ---------------------------------------------------------------------------

/** POST /privacy/erasure - Request erasure (admin:compliance) */
privacy.post(
  "/erasure",
  requirePermission("admin:compliance"),
  createRateLimit({ max: 1, windowMs: 24 * 60 * 60 * 1000, keyGenerator: keyGenerators.byUser }),
  auditRoute({ action: "privacy.erasure_requested", resourceType: "user" }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const body = await c.req.json();
    const parsed = erasureSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    try {
      const result = await eraseUserData(ctx.tenantId, parsed.data.userId);

      await getAuditLogger().logComplianceEvent(ctx.tenantId, "privacy.erasure_requested", {
        targetUserId: parsed.data.userId,
        requestedBy: ctx.userId,
        tablesProcessed: result.tablesProcessed,
        errors: result.errors,
      });

      return c.json(result);
    } catch (err) {
      console.error("[privacy] erasure request failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// Data export (portability)
// ---------------------------------------------------------------------------

/** GET /privacy/data-export/:userId - Export user data (admin:compliance or self) */
privacy.get(
  "/data-export/:userId",
  requireAnyPermission(["admin:compliance", "agent:chat"]),
  createRateLimit({ max: 5, windowMs: 60 * 60 * 1000, keyGenerator: keyGenerators.byUser }),
  auditRoute({
    action: "privacy.data_exported",
    resourceType: "user",
    resourceId: (ctx) => ctx.params.userId,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const targetUserId = c.req.param("userId");

    if (!canActOnUser(ctx, targetUserId)) {
      return forbidden(c, "Cannot export data for another user");
    }

    try {
      const data = await exportUserData(ctx.tenantId, targetUserId);

      await getAuditLogger().logComplianceEvent(ctx.tenantId, "privacy.data_exported", {
        targetUserId,
        exportedBy: ctx.userId,
      });

      return c.json(data);
    } catch (err) {
      console.error("[privacy] export user data failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/** GET /privacy/consent - List all consent records for the tenant */
privacy.get("/consent", requirePermission("admin:compliance"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const search = c.req.query("search");

  try {
    const consents = await listTenantConsents(ctx.tenantId, { search });
    return c.json(consents);
  } catch (err) {
    console.error("[privacy] list tenant consents failed:", err);
    return internalError(c);
  }
});

/** GET /privacy/consent/:userId - Consent status */
privacy.get(
  "/consent/:userId",
  requireAnyPermission(["admin:compliance", "agent:chat"]),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const targetUserId = c.req.param("userId");

    if (!canActOnUser(ctx, targetUserId)) {
      return forbidden(c, "Cannot view consent for another user");
    }

    try {
      const consents = await listUserConsents(ctx.tenantId, targetUserId);
      return c.json({ userId: targetUserId, consents });
    } catch (err) {
      console.error("[privacy] get user consents failed:", err);
      return internalError(c);
    }
  },
);

/** POST /privacy/consent/:userId - Update consent */
privacy.post(
  "/consent/:userId",
  requireAnyPermission(["admin:compliance", "agent:chat"]),
  auditRoute({
    action: "privacy.consent_updated",
    resourceType: "consent",
    resourceId: (ctx) => ctx.params.userId,
  }),
  async (c) => {
    const ctx = c.get("tenantContext") as TenantContext;
    const targetUserId = c.req.param("userId");
    const body = await c.req.json();
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    if (!canActOnUser(ctx, targetUserId)) {
      return forbidden(c, "Cannot update consent for another user");
    }

    try {
      if (parsed.data.granted) {
        const consent = await grantConsent({
          tenantId: ctx.tenantId,
          userId: targetUserId,
          purpose: parsed.data.purpose as ConsentPurpose,
          version: parsed.data.version ?? "1.0",
          ipAddress: ctx.ipAddress,
        });

        await getAuditLogger().logComplianceEvent(ctx.tenantId, "privacy.consent_updated", {
          targetUserId,
          purpose: parsed.data.purpose,
          granted: true,
          updatedBy: ctx.userId,
        });

        return c.json(consent);
      } else {
        await revokeConsent(ctx.tenantId, targetUserId, parsed.data.purpose as ConsentPurpose);

        await getAuditLogger().logComplianceEvent(ctx.tenantId, "privacy.consent_updated", {
          targetUserId,
          purpose: parsed.data.purpose,
          granted: false,
          updatedBy: ctx.userId,
        });

        return c.json({ userId: targetUserId, purpose: parsed.data.purpose, granted: false });
      }
    } catch (err) {
      console.error("[privacy] update consent failed:", err);
      return internalError(c);
    }
  },
);

// ---------------------------------------------------------------------------
// Breaches
// ---------------------------------------------------------------------------

/** GET /privacy/breaches - List breach records for the tenant */
privacy.get("/breaches", requirePermission("admin:compliance"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;

  try {
    const breaches = await listBreaches(ctx.tenantId);
    return c.json(breaches);
  } catch (err) {
    console.error("[privacy] list breaches failed:", err);
    return internalError(c);
  }
});

export { privacy };
export const privacyRoutes = privacy;
