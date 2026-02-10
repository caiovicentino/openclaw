import { query, withTransaction } from "../connection.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;
  employeeId: string | null;
  department: string | null;
  passwordHash: string | null;
  status: string;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  stackAuthId: string | null;
};

export type Role = {
  id: string;
  tenantId: string;
  name: string;
  displayName: string | null;
  department: string | null;
  permissions: string[];
  isSystemRole: boolean;
  createdAt: Date;
};

// ── Row mapping ──────────────────────────────────────────────────────────────

function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    email: row.email as string,
    name: (row.name as string) ?? null,
    employeeId: (row.employee_id as string) ?? null,
    department: (row.department as string) ?? null,
    passwordHash: (row.password_hash as string) ?? null,
    status: (row.status as string) ?? "active",
    mfaSecret: (row.mfa_secret as string) ?? null,
    mfaEnabled: (row.mfa_enabled as boolean) ?? false,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    stackAuthId: (row.stack_auth_id as string) ?? null,
  };
}

function mapRoleRow(row: Record<string, unknown>): Role {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    displayName: (row.display_name as string) ?? null,
    department: (row.department as string) ?? null,
    permissions: (row.permissions as string[]) ?? [],
    isSystemRole: (row.is_system_role as boolean) ?? false,
    createdAt: new Date(row.created_at as string),
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createUser(
  tenantId: string,
  data: {
    email: string;
    name: string;
    employeeId?: string;
    department?: string;
    passwordHash?: string;
    status?: string;
  },
): Promise<User> {
  const result = await query(
    `INSERT INTO users (tenant_id, email, name, employee_id, department, password_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      data.email,
      data.name,
      data.employeeId ?? null,
      data.department ?? null,
      data.passwordHash ?? null,
      data.status ?? "active",
    ],
  );
  return mapUserRow(result.rows[0]);
}

export async function getUserById(tenantId: string, userId: string): Promise<User | null> {
  const result = await query(`SELECT * FROM users WHERE id = $1 AND tenant_id = $2`, [
    userId,
    tenantId,
  ]);
  return result.rows.length > 0 ? mapUserRow(result.rows[0]) : null;
}

export async function getUserByEmail(tenantId: string, email: string): Promise<User | null> {
  const result = await query(`SELECT * FROM users WHERE email = $1 AND tenant_id = $2`, [
    email,
    tenantId,
  ]);
  return result.rows.length > 0 ? mapUserRow(result.rows[0]) : null;
}

export async function listUsers(
  tenantId: string,
  filters?: {
    department?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ users: User[]; total: number }> {
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let paramIndex = 2;

  if (filters?.department) {
    conditions.push(`department = $${paramIndex}`);
    params.push(filters.department);
    paramIndex++;
  }

  if (filters?.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }

  if (filters?.search) {
    conditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await query(
    `SELECT COUNT(*) AS total FROM users WHERE ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].total as string, 10);

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const dataResult = await query(
    `SELECT * FROM users WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset],
  );

  return {
    users: dataResult.rows.map(mapUserRow),
    total,
  };
}

export async function updateUser(
  tenantId: string,
  userId: string,
  data: Partial<User>,
): Promise<User> {
  const fieldMap: Record<string, string> = {
    email: "email",
    name: "name",
    employeeId: "employee_id",
    department: "department",
    passwordHash: "password_hash",
    status: "status",
    mfaSecret: "mfa_secret",
    mfaEnabled: "mfa_enabled",
    metadata: "metadata",
    stackAuthId: "stack_auth_id",
  };

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  for (const [tsKey, dbCol] of Object.entries(fieldMap)) {
    if (tsKey in data) {
      setClauses.push(`${dbCol} = $${paramIndex}`);
      params.push((data as Record<string, unknown>)[tsKey]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    const existing = await getUserById(tenantId, userId);
    if (!existing) throw new Error(`User ${userId} not found`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);

  params.push(userId, tenantId);
  const result = await query(
    `UPDATE users SET ${setClauses.join(", ")}
     WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
     RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw new Error(`User ${userId} not found in tenant ${tenantId}`);
  }
  return mapUserRow(result.rows[0]);
}

export async function deactivateUser(tenantId: string, userId: string): Promise<void> {
  const result = await query(
    `UPDATE users SET status = 'inactive', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  if (result.rowCount === 0) {
    throw new Error(`User ${userId} not found in tenant ${tenantId}`);
  }
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function getUserRoles(tenantId: string, userId: string): Promise<Role[]> {
  const result = await query(
    `SELECT r.* FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1 AND r.tenant_id = $2
     ORDER BY r.name`,
    [userId, tenantId],
  );
  return result.rows.map(mapRoleRow);
}

export async function assignRole(
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

export async function removeRole(userId: string, roleId: string): Promise<void> {
  await query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [userId, roleId]);
}

export async function getUserPermissions(tenantId: string, userId: string): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT jsonb_array_elements_text(r.permissions) AS perm
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1 AND r.tenant_id = $2`,
    [userId, tenantId],
  );
  return result.rows.map((row) => row.perm as string);
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

export async function updateLastLogin(tenantId: string, userId: string): Promise<void> {
  await query(
    `UPDATE users SET last_login_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
}

export async function setMfaSecret(
  tenantId: string,
  userId: string,
  secret: string,
): Promise<void> {
  await query(
    `UPDATE users SET mfa_secret = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [secret, userId, tenantId],
  );
}

export async function enableMfa(tenantId: string, userId: string): Promise<void> {
  await query(
    `UPDATE users SET mfa_enabled = TRUE, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
}

export async function disableMfa(tenantId: string, userId: string): Promise<void> {
  await query(
    `UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
}

// ── Stack Auth ──────────────────────────────────────────────────────────

export async function getUserByStackAuthId(stackAuthId: string): Promise<User | null> {
  const result = await query(`SELECT * FROM users WHERE stack_auth_id = $1`, [stackAuthId]);
  return result.rows.length > 0 ? mapUserRow(result.rows[0]) : null;
}

export async function linkStackAuthId(
  tenantId: string,
  userId: string,
  stackAuthId: string,
): Promise<void> {
  await query(
    `UPDATE users SET stack_auth_id = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [stackAuthId, userId, tenantId],
  );
}

export async function createUserFromStackAuth(
  tenantId: string,
  data: {
    email: string;
    name: string;
    stackAuthId: string;
    department?: string;
    status?: string;
  },
): Promise<User> {
  const result = await query(
    `INSERT INTO users (tenant_id, email, name, department, status, stack_auth_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      data.email,
      data.name,
      data.department ?? null,
      data.status ?? "active",
      data.stackAuthId,
    ],
  );
  return mapUserRow(result.rows[0]);
}

// ── Bulk operations ──────────────────────────────────────────────────────────

export async function bulkCreateUsers(
  tenantId: string,
  users: Array<{
    email: string;
    name: string;
    department?: string;
    employeeId?: string;
  }>,
): Promise<User[]> {
  if (users.length === 0) return [];

  return withTransaction(async (client) => {
    const created: User[] = [];

    for (const u of users) {
      const result = await client.query(
        `INSERT INTO users (tenant_id, email, name, department, employee_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, u.email, u.name, u.department ?? null, u.employeeId ?? null],
      );
      created.push(mapUserRow(result.rows[0]));
    }

    return created;
  });
}
