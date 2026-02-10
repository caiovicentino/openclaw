import {
  createRole as repoCreateRole,
  getRoleById,
  getRoleByName,
  listRoles,
  updateRole,
  deleteRole,
  assignRoleToUser,
  revokeRoleFromUser,
  listUserRoles,
  setUserRoles,
  getUserPermissions,
  type Role,
} from "../../db/repositories/role-repo.js";

// ---------------------------------------------------------------------------
// Role template types
// ---------------------------------------------------------------------------

export type RoleTemplate = {
  name: string;
  displayName: string;
  description: string;
  department?: string;
  permissions: string[];
  isSystemRole: boolean;
};

// ---------------------------------------------------------------------------
// Default role templates
// ---------------------------------------------------------------------------

/**
 * Default role templates provisioned when a new tenant is created.
 * Permissions follow the resource:action pattern defined in permissions.ts.
 */
export const DEFAULT_ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    name: "super-admin",
    displayName: "Super Administrator",
    description: "Full system access with all permissions including tenant management.",
    permissions: ["*"],
    isSystemRole: true,
  },
  {
    name: "admin",
    displayName: "Administrator",
    description: "Manage users, roles, agents, and tenant settings. Cannot manage other tenants.",
    permissions: [
      "agent:chat",
      "agent:chat:unrestricted",
      "agent:view_all_history",
      "agent:export_history",
      "agent:manage_sessions",
      "tools:exec",
      "tools:browse",
      "tools:file_read",
      "tools:file_write",
      "tools:memory_read",
      "tools:memory_write",
      "skills:use",
      "skills:manage",
      "channel:all",
      "data:all",
      "data:confidential",
      "admin:users",
      "admin:users:view",
      "admin:roles",
      "admin:config",
      "admin:compliance",
      "admin:audit",
      "admin:audit:export",
      "admin:agents",
      "admin:channels",
      "admin:dashboard",
      "admin:reports",
      "admin:integrations",
      "admin:security",
      "admin:data_retention",
    ],
    isSystemRole: true,
  },
  {
    name: "manager",
    displayName: "Manager",
    description: "Manage team members, view audit logs, and configure agents within department.",
    permissions: [
      "agent:chat",
      "agent:view_own_history",
      "agent:view_team_history",
      "agent:export_history",
      "agent:manage_own_sessions",
      "tools:exec:sandboxed",
      "tools:browse",
      "tools:file_read",
      "tools:memory_read",
      "skills:use",
      "channel:web",
      "channel:slack",
      "data:department",
      "data:own",
      "admin:users:view",
      "admin:audit",
      "admin:dashboard",
      "admin:reports",
    ],
    isSystemRole: true,
  },
  {
    name: "employee",
    displayName: "Employee",
    description: "Standard user with access to agents, sessions, and tools.",
    permissions: [
      "agent:chat",
      "agent:view_own_history",
      "agent:manage_own_sessions",
      "tools:exec:sandboxed",
      "tools:file_read",
      "tools:memory_read",
      "skills:use",
      "channel:web",
      "data:own",
      "data:department",
    ],
    isSystemRole: true,
  },
  {
    name: "viewer",
    displayName: "Viewer (Read Only)",
    description: "Read-only access to own history and data.",
    permissions: ["agent:view_own_history", "data:own"],
    isSystemRole: true,
  },
] as const;

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

/**
 * Get a default role template by name.
 */
export function getDefaultRoleTemplate(name: string): RoleTemplate | undefined {
  return DEFAULT_ROLE_TEMPLATES.find((role) => role.name === name);
}

/**
 * Get all default role templates.
 */
export function getAllDefaultRoleTemplates(): RoleTemplate[] {
  return [...DEFAULT_ROLE_TEMPLATES];
}

/**
 * Create a department-specific role based on an existing template.
 */
export function createDepartmentRole(
  department: string,
  baseRole: string,
  additionalPermissions?: string[],
): RoleTemplate {
  const base = getDefaultRoleTemplate(baseRole);
  if (!base) {
    throw new Error(`Base role template "${baseRole}" not found`);
  }

  const deptPermission = `data:${department}`;
  const permissions = [...base.permissions];

  if (!permissions.includes(deptPermission)) {
    permissions.push(deptPermission);
  }

  if (additionalPermissions) {
    for (const perm of additionalPermissions) {
      if (!permissions.includes(perm)) {
        permissions.push(perm);
      }
    }
  }

  return {
    name: `${department}-${base.name}`,
    displayName: `${capitalize(department)} ${base.displayName}`,
    description: `${base.description} Scoped to ${department} department.`,
    department,
    permissions,
    isSystemRole: false,
  };
}

// ---------------------------------------------------------------------------
// Role provisioning
// ---------------------------------------------------------------------------

/**
 * Provision all default role templates for a tenant.
 * Skips roles that already exist (by name). Returns created roles.
 */
export async function provisionDefaultRoles(tenantId: string): Promise<Role[]> {
  const created: Role[] = [];
  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const existing = await getRoleByName(tenantId, template.name);
    if (existing) continue;

    const role = await repoCreateRole(tenantId, {
      name: template.name,
      displayName: template.displayName,
      permissions: [...template.permissions],
      isSystemRole: true,
    });
    created.push(role);
  }
  return created;
}

/**
 * Reset a system role's permissions back to the default template.
 * Returns the updated role or null if the role or template is not found.
 */
export async function resetRoleToDefault(tenantId: string, roleId: string): Promise<Role | null> {
  const role = await getRoleById(tenantId, roleId);
  if (!role || !role.isSystemRole) return null;

  const template = getDefaultRoleTemplate(role.name);
  if (!template) return null;

  return updateRole(tenantId, roleId, {
    permissions: [...template.permissions],
  });
}

// ---------------------------------------------------------------------------
// Role CRUD wrappers with business rules
// ---------------------------------------------------------------------------

/**
 * Create a custom (non-system) role for a tenant.
 */
export async function createCustomRole(
  tenantId: string,
  input: {
    name: string;
    displayName?: string;
    department?: string;
    permissions: string[];
  },
): Promise<Role> {
  const existing = await getRoleByName(tenantId, input.name);
  if (existing) {
    throw new Error(`Role with name "${input.name}" already exists in this tenant`);
  }

  return repoCreateRole(tenantId, {
    name: input.name,
    displayName: input.displayName,
    department: input.department,
    permissions: input.permissions,
    isSystemRole: false,
  });
}

/**
 * Update a role with safety checks.
 * System roles can only have their permissions updated.
 */
export async function updateRoleSafe(
  tenantId: string,
  roleId: string,
  input: Partial<{ displayName: string; department: string; permissions: string[] }>,
): Promise<Role | null> {
  const role = await getRoleById(tenantId, roleId);
  if (!role) return null;

  if (role.isSystemRole) {
    return updateRole(tenantId, roleId, {
      permissions: input.permissions,
    });
  }

  return updateRole(tenantId, roleId, input);
}

/**
 * Delete a role with safety checks. System roles cannot be deleted.
 */
export async function deleteRoleSafe(tenantId: string, roleId: string): Promise<boolean> {
  const role = await getRoleById(tenantId, roleId);
  if (!role) return false;

  if (role.isSystemRole) {
    throw new Error(`Cannot delete system role "${role.name}"`);
  }

  await deleteRole(tenantId, roleId);
  return true;
}

/**
 * Clone an existing role to create a new custom role with the same permissions.
 */
export async function cloneRole(
  tenantId: string,
  sourceRoleId: string,
  newName: string,
  newDisplayName?: string,
): Promise<Role> {
  const source = await getRoleById(tenantId, sourceRoleId);
  if (!source) {
    throw new Error("Source role not found");
  }

  return createCustomRole(tenantId, {
    name: newName,
    displayName: newDisplayName ?? `${source.displayName ?? source.name} (Copy)`,
    department: source.department ?? undefined,
    permissions: [...source.permissions],
  });
}

// ---------------------------------------------------------------------------
// Permission utilities
// ---------------------------------------------------------------------------

/**
 * Merge the permissions of multiple roles into a deduplicated sorted array.
 */
export function mergePermissions(roles: Role[]): string[] {
  const set = new Set<string>();
  for (const role of roles) {
    for (const perm of role.permissions) {
      set.add(perm);
    }
  }
  return Array.from(set).sort();
}

/**
 * Check if a set of permissions includes a wildcard grant.
 */
export function hasWildcardPermission(permissions: string[]): boolean {
  return permissions.includes("*");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// Re-exports from role-repo for convenience
// ---------------------------------------------------------------------------

export {
  getRoleById,
  getRoleByName,
  listRoles,
  assignRoleToUser,
  revokeRoleFromUser,
  listUserRoles,
  setUserRoles,
  getUserPermissions,
  type Role,
};
