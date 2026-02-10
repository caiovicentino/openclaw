import type { MiddlewareHandler } from "hono";
import { createTenantContext, type TenantContext } from "../context/tenant-context.js";
import { verifyStackAuthToken } from "./stack-auth.js";
import { resolveStackAuthUser } from "./user-bridge.js";

declare module "hono" {
  interface ContextVariableMap {
    tenantContext: TenantContext;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export function jwtAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json(
        { error: "Unauthorized", message: "Missing or malformed Authorization header" },
        401,
      );
    }

    try {
      const stackPayload = await verifyStackAuthToken(token);
      const resolved = await resolveStackAuthUser(stackPayload);

      const tenantContext = createTenantContext({
        tenantId: resolved.tenantId,
        tenantSlug: resolved.tenantSlug,
        userId: resolved.userId,
        userEmail: resolved.email,
        userName: resolved.name,
        department: resolved.department,
        roles: resolved.roles,
        permissions: resolved.permissions,
        ipAddress: c.req.header("X-Forwarded-For")?.split(",")[0]?.trim(),
      });

      c.set("tenantContext", tenantContext);
    } catch {
      return c.json({ error: "Unauthorized", message: "Invalid or expired access token" }, 401);
    }

    await next();
  };
}

export function optionalJwtMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
      await next();
      return;
    }

    try {
      const stackPayload = await verifyStackAuthToken(token);
      const resolved = await resolveStackAuthUser(stackPayload);

      const tenantContext = createTenantContext({
        tenantId: resolved.tenantId,
        tenantSlug: resolved.tenantSlug,
        userId: resolved.userId,
        userEmail: resolved.email,
        userName: resolved.name,
        department: resolved.department,
        roles: resolved.roles,
        permissions: resolved.permissions,
        ipAddress: c.req.header("X-Forwarded-For")?.split(",")[0]?.trim(),
      });

      c.set("tenantContext", tenantContext);
    } catch {
      // Silently ignore — optional auth
    }

    await next();
  };
}
