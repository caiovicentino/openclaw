import type { MiddlewareHandler } from "hono";
import type { TenantContext } from "../../context/tenant-context.js";

/**
 * Middleware that ensures the tenant referenced by the JWT is active.
 *
 * Place after `jwtAuthMiddleware()`. On first use per request it queries
 * the tenant repo and rejects suspended or unknown tenants with 403.
 */
export function requireActiveTenant(): MiddlewareHandler {
  return async (c, next) => {
    const ctx: TenantContext | undefined = c.get("tenantContext");
    if (!ctx) {
      return c.json({ error: "Unauthorized", message: "Authentication required" }, 401);
    }

    // Dynamic import to avoid circular dependency at module load time
    const { getTenantById } = await import("../../db/repositories/tenant-repo.js");
    const tenant = await getTenantById(ctx.tenantId);

    if (!tenant) {
      return c.json({ error: "Forbidden", message: "Unknown tenant" }, 403);
    }
    if (tenant.status === "suspended") {
      return c.json({ error: "Forbidden", message: "Tenant account is suspended" }, 403);
    }
    if (tenant.status !== "active") {
      return c.json({ error: "Forbidden", message: `Tenant account is ${tenant.status}` }, 403);
    }

    await next();
  };
}
