import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import {
  createRateLimit,
  listRateLimits,
  updateRateLimit,
  deleteRateLimit,
} from "../../db/repositories/rate-limit-repo.js";
import { requirePermission } from "../../rbac/middleware.js";
import { getQuotaStatus } from "../../services/rate-limiter/quota-service.js";
import { badRequest, notFound } from "../errors.js";

const rateLimitSchema = z.object({
  targetType: z.enum(["user", "agent", "tenant"]),
  targetId: z.string().nullable().optional(),
  limitType: z.enum(["tokens_per_hour", "tokens_per_day", "cost_per_day", "requests_per_minute"]),
  limitValue: z.number().positive(),
  warningThreshold: z.number().min(0).max(1).optional(),
  enabled: z.boolean().optional(),
});

const updateSchema = rateLimitSchema.partial();

const rateLimits = new Hono();

/** GET / - List all rate limits (admin) */
rateLimits.get("/", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const limits = await listRateLimits(ctx.tenantId);
  return c.json({ rateLimits: limits });
});

/** POST / - Create a rate limit (admin) */
rateLimits.post("/", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const body = await c.req.json();
  const parsed = rateLimitSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  const limit = await createRateLimit(ctx.tenantId, parsed.data);
  return c.json(limit, 201);
});

/** PATCH /:id - Update a rate limit (admin) */
rateLimits.patch("/:id", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  const updated = await updateRateLimit(ctx.tenantId, id, parsed.data);
  if (!updated) {
    return notFound(c, "Rate limit");
  }
  return c.json(updated);
});

/** DELETE /:id - Delete a rate limit (admin) */
rateLimits.delete("/:id", requirePermission("admin:config"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const id = c.req.param("id");
  const deleted = await deleteRateLimit(ctx.tenantId, id);
  if (!deleted) {
    return notFound(c, "Rate limit");
  }
  return c.json({ ok: true });
});

/** GET /quota - Get current user's quota status */
rateLimits.get("/quota", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const status = await getQuotaStatus(ctx.tenantId, ctx.userId);
  return c.json(status);
});

export { rateLimits };
export const rateLimitRoutes = rateLimits;
