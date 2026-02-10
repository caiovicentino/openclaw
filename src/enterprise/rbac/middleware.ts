import type { MiddlewareHandler } from "hono";
import type { TenantContext } from "../context/tenant-context.js";
import {
  checkPermission,
  checkAllPermissions,
  checkAnyPermission,
  evaluatePolicy,
  checkDataAccess,
  checkToolAccess,
  type PolicyRule,
  type PolicyDecision,
} from "./policy-engine.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTenantContext(c: { get(key: "tenantContext"): TenantContext }): TenantContext | null {
  try {
    return c.get("tenantContext") ?? null;
  } catch {
    return null;
  }
}

function forbidden(c: Parameters<MiddlewareHandler>[0], decision: PolicyDecision) {
  return c.json(
    {
      error: "Forbidden",
      message: decision.reason ?? "Insufficient permissions",
    },
    403,
  );
}

function unauthorized(c: Parameters<MiddlewareHandler>[0]) {
  return c.json(
    {
      error: "Unauthorized",
      message: "Authentication required",
    },
    401,
  );
}

// ---------------------------------------------------------------------------
// Middleware factories
// ---------------------------------------------------------------------------

/**
 * Require a single permission.
 *
 * Must be placed after `jwtAuthMiddleware()` so that `tenantContext` is
 * available on the Hono context.
 *
 * @example
 * app.get("/agents", jwtAuthMiddleware(), requirePermission("agent:read"), handler)
 */
export function requirePermission(permission: string): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    const decision = checkPermission(ctx, permission);
    if (!decision.allowed) return forbidden(c, decision);

    await next();
  };
}

/**
 * Require ALL of the listed permissions.
 *
 * @example
 * app.post("/agents", jwtAuthMiddleware(), requireAllPermissions(["agent:create", "agent:config:write"]), handler)
 */
export function requireAllPermissions(permissions: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    const decision = checkAllPermissions(ctx, permissions);
    if (!decision.allowed) return forbidden(c, decision);

    await next();
  };
}

/**
 * Require at least ONE of the listed permissions.
 *
 * @example
 * app.get("/data", jwtAuthMiddleware(), requireAnyPermission(["data:read", "data:export"]), handler)
 */
export function requireAnyPermission(permissions: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    const decision = checkAnyPermission(ctx, permissions);
    if (!decision.allowed) return forbidden(c, decision);

    await next();
  };
}

/**
 * Evaluate a set of policy rules. All rules must pass.
 *
 * @example
 * app.delete("/agents/:id", jwtAuthMiddleware(), requirePolicy([
 *   { check: "agent:delete" },
 *   { check: (ctx) => ctx.department === "engineering", denyMessage: "Only engineering can delete agents" },
 * ]), handler)
 */
export function requirePolicy(rules: readonly PolicyRule[]): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    const decision = evaluatePolicy(ctx, rules);
    if (!decision.allowed) return forbidden(c, decision);

    await next();
  };
}

/**
 * Require one of the given role names.
 *
 * @example
 * app.get("/admin", jwtAuthMiddleware(), requireRole("super_admin", "admin"), handler)
 */
export function requireRole(...roleNames: string[]): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    const match = roleNames.some((r) => ctx.roles.includes(r));
    if (!match) {
      return forbidden(c, {
        allowed: false,
        reason: `Requires one of the following roles: ${roleNames.join(", ")}`,
      });
    }

    await next();
  };
}

/**
 * Require the user to belong to one of the listed departments.
 *
 * @example
 * app.get("/hr/data", jwtAuthMiddleware(), requireDepartment("hr", "management"), handler)
 */
export function requireDepartment(...departments: string[]): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    const inDepartment = departments.some(
      (dept) => ctx.department.toLowerCase() === dept.toLowerCase(),
    );

    if (!inDepartment) {
      return forbidden(c, {
        allowed: false,
        reason: `Requires membership in department: ${departments.join(", ")}`,
      });
    }

    await next();
  };
}

/**
 * Require the user to have access to a specific tool.
 *
 * @example
 * app.post("/exec", jwtAuthMiddleware(), requireToolAccess("bash"), handler)
 */
export function requireToolAccess(toolName: string): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    const decision = checkToolAccess(ctx, toolName);
    if (!decision.allowed) return forbidden(c, decision);

    await next();
  };
}

/**
 * Require the user to have data access for a target department.
 *
 * The target department can be specified statically or extracted from a
 * route parameter at runtime.
 *
 * @example
 * app.get("/data/:dept", jwtAuthMiddleware(), requireDataAccess("dept"), handler)
 */
export function requireDataAccess(departmentOrParam: string): MiddlewareHandler {
  return async (c, next) => {
    const ctx = getTenantContext(c);
    if (!ctx) return unauthorized(c);

    // If it looks like a route param name, resolve it at runtime
    const target = c.req.param(departmentOrParam) ?? departmentOrParam;
    const decision = checkDataAccess(ctx, target);
    if (!decision.allowed) return forbidden(c, decision);

    await next();
  };
}
