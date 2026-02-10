import type { TenantContext } from "../context/tenant-context.js";
import { PERM_WILDCARD } from "./permissions.js";
import { TOOL_PERMISSION_MAP } from "./tool-permissions.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyDecision = {
  allowed: boolean;
  /** Human-readable reason for denial (undefined when allowed). */
  reason?: string;
};

export type PolicyRule = {
  /** The permission string this rule evaluates, or a predicate function. */
  check: string | ((ctx: TenantContext) => boolean);
  /** Optional message shown when denied. */
  denyMessage?: string;
};

// ---------------------------------------------------------------------------
// Core permission checks
// ---------------------------------------------------------------------------

/**
 * Check if a permission set includes a specific permission.
 *
 * Supports:
 *  - Exact match: `"agent:create"` matches `"agent:create"`
 *  - Wildcard: `"*"` matches everything
 *  - Prefix wildcard: `"agent:*"` matches `"agent:create"`, `"agent:read"`, etc.
 */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === PERM_WILDCARD) return true;
  if (granted === required) return true;

  // Prefix wildcard: "admin:user:*" matches "admin:user:create"
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -1); // "admin:user:"
    return required.startsWith(prefix);
  }

  return false;
}

/**
 * Check if a set of granted permissions satisfies a required permission.
 */
export function hasPermission(grantedPermissions: readonly string[], required: string): boolean {
  return grantedPermissions.some((g) => permissionMatches(g, required));
}

/**
 * Check if a set of granted permissions satisfies ALL required permissions.
 */
export function hasAllPermissions(
  grantedPermissions: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((r) => hasPermission(grantedPermissions, r));
}

/**
 * Check if a set of granted permissions satisfies ANY of the required permissions.
 */
export function hasAnyPermission(
  grantedPermissions: readonly string[],
  required: readonly string[],
): boolean {
  return required.some((r) => hasPermission(grantedPermissions, r));
}

// ---------------------------------------------------------------------------
// Context-based checks (use TenantContext)
// ---------------------------------------------------------------------------

/** Check a single permission against a TenantContext. */
export function checkPermission(ctx: TenantContext, required: string): PolicyDecision {
  if (hasPermission(ctx.permissions, required)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Missing required permission: ${required}`,
  };
}

/** Check that the context has ALL listed permissions. */
export function checkAllPermissions(
  ctx: TenantContext,
  required: readonly string[],
): PolicyDecision {
  const missing = required.filter((r) => !hasPermission(ctx.permissions, r));
  if (missing.length === 0) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Missing required permissions: ${missing.join(", ")}`,
  };
}

/** Check that the context has at least ONE of the listed permissions. */
export function checkAnyPermission(
  ctx: TenantContext,
  required: readonly string[],
): PolicyDecision {
  if (hasAnyPermission(ctx.permissions, required)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Requires at least one of: ${required.join(", ")}`,
  };
}

// ---------------------------------------------------------------------------
// Policy rules evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate an array of policy rules against a TenantContext.
 *
 * All rules must pass for the overall decision to be "allowed".
 */
export function evaluatePolicy(ctx: TenantContext, rules: readonly PolicyRule[]): PolicyDecision {
  for (const rule of rules) {
    if (typeof rule.check === "string") {
      const decision = checkPermission(ctx, rule.check);
      if (!decision.allowed) {
        return {
          allowed: false,
          reason: rule.denyMessage ?? decision.reason,
        };
      }
    } else {
      const ok = rule.check(ctx);
      if (!ok) {
        return {
          allowed: false,
          reason: rule.denyMessage ?? "Policy rule denied access",
        };
      }
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Resource ownership check
// ---------------------------------------------------------------------------

/** Check if the user owns the resource or has the admin override permission. */
export function checkOwnerOrPermission(
  ctx: TenantContext,
  resourceOwnerId: string,
  adminPermission: string,
): PolicyDecision {
  if (ctx.userId === resourceOwnerId) {
    return { allowed: true };
  }
  return checkPermission(ctx, adminPermission);
}

// ---------------------------------------------------------------------------
// Role checks
// ---------------------------------------------------------------------------

/** Check if the context includes a specific role name. */
export function hasRole(ctx: TenantContext, roleName: string): boolean {
  return ctx.roles.includes(roleName);
}

/** Check if the context includes any of the given role names. */
export function hasAnyRole(ctx: TenantContext, roleNames: readonly string[]): boolean {
  return roleNames.some((r) => ctx.roles.includes(r));
}

// ---------------------------------------------------------------------------
// Data access checks
// ---------------------------------------------------------------------------

/**
 * Check if a user can access data from a target department based on their
 * data-scoped permissions.
 *
 * Hierarchy: data:all > data:cross_department > data:department (own) > data:own
 */
export function checkDataAccess(ctx: TenantContext, targetDepartment: string): PolicyDecision {
  if (hasPermission(ctx.permissions, "data:all")) {
    return { allowed: true };
  }

  if (hasPermission(ctx.permissions, "data:cross_department")) {
    return { allowed: true };
  }

  if (hasPermission(ctx.permissions, "data:department")) {
    if (ctx.department.toLowerCase() === targetDepartment.toLowerCase()) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Department '${ctx.department}' cannot access data from '${targetDepartment}'`,
    };
  }

  if (hasPermission(ctx.permissions, "data:own")) {
    return {
      allowed: false,
      reason: "User only has access to own data, not department-level data",
    };
  }

  return {
    allowed: false,
    reason: "No data access permissions found",
  };
}

// ---------------------------------------------------------------------------
// Tool access checks
// ---------------------------------------------------------------------------

/**
 * Check if a user is allowed to use a specific tool.
 *
 * Maps tool names to the required permission(s) and checks whether the
 * user holds at least one of them.
 */
export function checkToolAccess(ctx: TenantContext, toolName: string): PolicyDecision {
  const normalizedTool = toolName.toLowerCase();
  const requiredPermissions = TOOL_PERMISSION_MAP[normalizedTool];

  if (!requiredPermissions) {
    return { allowed: false, reason: `Unknown tool: ${toolName}` };
  }

  return checkAnyPermission(ctx, requiredPermissions);
}

// ---------------------------------------------------------------------------
// Permission filtering
// ---------------------------------------------------------------------------

/**
 * Return the subset of `requestedPermissions` that the user actually holds.
 */
export function filterAllowedPermissions(
  ctx: TenantContext,
  requestedPermissions: readonly string[],
): string[] {
  return requestedPermissions.filter((p) => hasPermission(ctx.permissions, p));
}
