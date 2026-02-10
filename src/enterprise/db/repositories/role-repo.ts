import { query, withTransaction } from "../connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  displayName: string | null;
  department: string | null;
  permissions: string[];
  isSystemRole: boolean;
  createdAt: Date;
}

export interface UserRoleAssignment {
  userId: string;
  roleId: string;
  grantedAt: Date;
  grantedBy: string | null;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toRole(row: Record<string, unknown>): Role {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    displayName: (row.display_name as string) ?? null,
    department: (row.department as string) ?? null,
    permissions: (row.permissions as string[]) ?? [],
    isSystemRole: row.is_system_role as boolean,
    createdAt: row.created_at as Date,
  };
}

// ---------------------------------------------------------------------------
// Role CRUD
// ---------------------------------------------------------------------------

/** Create a new role within a tenant. */
export async function createRole(
  tenantId: string,
  data: {
    name: string;
    displayName?: string;
    department?: string;
    permissions: string[];
    isSystemRole?: boolean;
  },
): Promise<Role> {
  const result = await query(
    `INSERT INTO roles (tenant_id, name, display_name, department, permissions, is_system_role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      data.name,
      data.displayName ?? null,
      data.department ?? null,
      JSON.stringify(data.permissions),
      data.isSystemRole ?? false,
    ],
  );
  return toRole(result.rows[0]);
}

/** Find a role by its primary key, scoped to a tenant. */
export async function getRoleById(tenantId: string, roleId: string): Promise<Role | null> {
  const result = await query(`SELECT * FROM roles WHERE id = $1 AND tenant_id = $2`, [
    roleId,
    tenantId,
  ]);
  return result.rows[0] ? toRole(result.rows[0]) : null;
}

/** Find a role by name within a tenant. */
export async function getRoleByName(tenantId: string, name: string): Promise<Role | null> {
  const result = await query(`SELECT * FROM roles WHERE tenant_id = $1 AND name = $2`, [
    tenantId,
    name,
  ]);
  return result.rows[0] ? toRole(result.rows[0]) : null;
}

/** List roles for a tenant with optional filters, pagination, and total count. */
export async function listRoles(
  tenantId: string,
  filters?: { department?: string; limit?: number; offset?: number },
): Promise<{ roles: Role[]; total: number }> {
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.department) {
    conditions.push(`department = $${idx++}`);
    params.push(filters.department);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM roles ${where}`, params);
  const total: number = countResult.rows[0].total;

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  const result = await query(
    `SELECT * FROM roles ${where} ORDER BY name LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  return { roles: result.rows.map(toRole), total };
}

/** Update a role. Only the supplied fields are changed. */
export async function updateRole(
  tenantId: string,
  roleId: string,
  data: Partial<{ displayName: string; department: string; permissions: string[] }>,
): Promise<Role> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.displayName !== undefined) {
    sets.push(`display_name = $${idx++}`);
    params.push(data.displayName);
  }
  if (data.department !== undefined) {
    sets.push(`department = $${idx++}`);
    params.push(data.department);
  }
  if (data.permissions !== undefined) {
    sets.push(`permissions = $${idx++}`);
    params.push(JSON.stringify(data.permissions));
  }

  if (sets.length === 0) {
    const existing = await getRoleById(tenantId, roleId);
    if (!existing) throw new Error(`Role not found: ${roleId}`);
    return existing;
  }

  params.push(roleId, tenantId);
  const result = await query(
    `UPDATE roles SET ${sets.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw new Error(`Role not found: ${roleId}`);
  }
  return toRole(result.rows[0]);
}

/** Delete a role. Throws if the role is a system role. */
export async function deleteRole(tenantId: string, roleId: string): Promise<void> {
  const role = await getRoleById(tenantId, roleId);
  if (!role) {
    throw new Error(`Role not found: ${roleId}`);
  }
  if (role.isSystemRole) {
    throw new Error(`Cannot delete system role: ${role.name}`);
  }
  await query(`DELETE FROM roles WHERE id = $1 AND tenant_id = $2`, [roleId, tenantId]);
}

// ---------------------------------------------------------------------------
// Default roles seeding
// ---------------------------------------------------------------------------

const DEFAULT_ROLES: Array<{
  name: string;
  displayName: string;
  permissions: string[];
}> = [
  {
    name: "super-admin",
    displayName: "Super Administrator",
    permissions: ["*"],
  },
  {
    name: "admin",
    displayName: "Administrator",
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
  },
  {
    name: "manager",
    displayName: "Manager",
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
  },
  {
    name: "employee",
    displayName: "Employee",
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
  },
  {
    name: "viewer",
    displayName: "Viewer (Read Only)",
    permissions: ["agent:view_own_history", "data:own"],
  },
];

/**
 * Seed the default system roles for a tenant.
 * Uses ON CONFLICT to skip roles that already exist.
 */
export async function seedDefaultRoles(tenantId: string): Promise<void> {
  await withTransaction(async (client) => {
    for (const role of DEFAULT_ROLES) {
      await client.query(
        `INSERT INTO roles (tenant_id, name, display_name, permissions, is_system_role)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (tenant_id, name) DO NOTHING`,
        [tenantId, role.name, role.displayName, JSON.stringify(role.permissions)],
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Users-with-role query
// ---------------------------------------------------------------------------

/** Get all users assigned to a given role, returning basic user info. */
export async function getUsersWithRole(
  tenantId: string,
  roleId: string,
): Promise<Array<{ userId: string; email: string; name: string }>> {
  const result = await query(
    `SELECT u.id AS user_id, u.email, u.name
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     WHERE ur.role_id = $1 AND u.tenant_id = $2
     ORDER BY u.name, u.email`,
    [roleId, tenantId],
  );
  return result.rows.map((row) => ({
    userId: row.user_id as string,
    email: row.email as string,
    name: (row.name as string) ?? "",
  }));
}

// ---------------------------------------------------------------------------
// User-Role assignments
// ---------------------------------------------------------------------------

/** Assign a role to a user. Idempotent (ON CONFLICT DO NOTHING). */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  grantedBy?: string,
): Promise<void> {
  await query(
    `INSERT INTO user_roles (user_id, role_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId, grantedBy ?? null],
  );
}

/** Remove a role from a user. Returns true if the row was deleted. */
export async function revokeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
  const result = await query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [
    userId,
    roleId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

/** List all roles currently assigned to a user, scoped to a tenant. */
export async function listUserRoles(tenantId: string, userId: string): Promise<Role[]> {
  const result = await query(
    `SELECT r.*
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE r.tenant_id = $1 AND ur.user_id = $2
     ORDER BY r.name`,
    [tenantId, userId],
  );
  return result.rows.map(toRole);
}

/** List all user IDs assigned to a given role. */
export async function listRoleMembers(roleId: string): Promise<UserRoleAssignment[]> {
  const result = await query(
    `SELECT user_id, role_id, granted_at, granted_by
     FROM user_roles WHERE role_id = $1
     ORDER BY granted_at`,
    [roleId],
  );
  return result.rows.map((row) => ({
    userId: row.user_id as string,
    roleId: row.role_id as string,
    grantedAt: row.granted_at as Date,
    grantedBy: (row.granted_by as string) ?? null,
  }));
}

/**
 * Replace all role assignments for a user within a single transaction.
 * Useful for bulk role-sync operations.
 */
export async function setUserRoles(
  tenantId: string,
  userId: string,
  roleIds: string[],
  grantedBy?: string,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM user_roles
       WHERE user_id = $1
         AND role_id IN (SELECT id FROM roles WHERE tenant_id = $2)`,
      [userId, tenantId],
    );

    for (const roleId of roleIds) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1, $2, $3)`,
        [userId, roleId, grantedBy ?? null],
      );
    }
  });
}

/**
 * Collect the merged permission set for a user by aggregating all assigned roles.
 */
export async function getUserPermissions(tenantId: string, userId: string): Promise<string[]> {
  const roles = await listUserRoles(tenantId, userId);
  const permissionSet = new Set<string>();
  for (const role of roles) {
    for (const p of role.permissions) {
      permissionSet.add(p);
    }
  }
  return Array.from(permissionSet).sort();
}
