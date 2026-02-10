/**
 * Enterprise permission-based tool filter.
 *
 * Maps RBAC permissions from the central permissions registry to concrete
 * agent tool names (as used by pi-agent-core), then filters/wraps the tool
 * list so that users can only invoke tools they have been granted.
 */

import type { TenantContext } from "../context/tenant-context.js";
import type { Permission } from "../rbac/permissions.js";
import { hasPermission, hasAnyPermission } from "../context/tenant-context.js";
import { TOOL_PERMISSION_MAP } from "../rbac/tool-permissions.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ToolLike = {
  name: string;
  execute?: (...args: unknown[]) => unknown;
};

/**
 * Returns true when the tenant context grants access to a tool identified by
 * its canonical name. Unknown tools default to denied in enterprise mode.
 */
export function isToolAllowed(ctx: TenantContext, toolName: string): boolean {
  // Wildcard permission grants everything.
  if (ctx.permissions.includes("*")) {
    return true;
  }

  const normalized = toolName.trim().toLowerCase();
  const required = TOOL_PERMISSION_MAP[normalized];

  // If we have no mapping for this tool, deny by default in enterprise mode.
  if (!required || required.length === 0) {
    return false;
  }

  // User needs ANY ONE of the listed permissions.
  return hasAnyPermission(ctx, required);
}

/**
 * Filters an array of agent tools, returning only those the user is
 * permitted to invoke according to RBAC.
 */
export function filterToolsByPermission<T extends ToolLike>(ctx: TenantContext, tools: T[]): T[] {
  return tools.filter((tool) => isToolAllowed(ctx, tool.name));
}

/**
 * Wraps each tool's execute method so that an unauthorized call throws
 * instead of silently executing.  Useful when the tool list is shared
 * across contexts (e.g. cached) and you cannot simply remove entries.
 */
export function wrapToolsWithPermissionGuard<T extends ToolLike>(
  ctx: TenantContext,
  tools: T[],
): T[] {
  return tools.map((tool) => {
    if (isToolAllowed(ctx, tool.name)) {
      return tool;
    }
    if (!tool.execute) {
      return tool;
    }
    return {
      ...tool,
      execute: async () => {
        throw new Error(
          `Permission denied: tool "${tool.name}" requires one of [${(TOOL_PERMISSION_MAP[tool.name.trim().toLowerCase()] ?? []).join(", ")}]`,
        );
      },
    };
  });
}

/**
 * Returns the set of permission keys that grant access to at least one tool.
 * Useful for documenting which permissions affect tool availability.
 */
export function getToolPermissions(): Permission[] {
  const perms = new Set<Permission>();
  for (const list of Object.values(TOOL_PERMISSION_MAP)) {
    for (const p of list) {
      perms.add(p);
    }
  }
  return [...perms];
}

/**
 * Returns the tool names a given permission unlocks.
 */
export function getToolsForPermission(permission: Permission): string[] {
  return Object.entries(TOOL_PERMISSION_MAP)
    .filter(([, perms]) => perms.includes(permission))
    .map(([toolName]) => toolName);
}

/**
 * Check whether the exec tool should be sandboxed for this user.
 * Returns true when the user has `tools:exec:sandboxed` but NOT `tools:exec`.
 */
export function isSandboxedExecOnly(ctx: TenantContext): boolean {
  return (
    hasPermission(ctx, "tools:exec:sandboxed" as string) &&
    !hasPermission(ctx, "tools:exec" as string)
  );
}
