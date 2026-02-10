import { query, withTransaction } from "../connection.js";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  settings: Record<string, unknown>;
  dataRegion: string | null;
  createdAt: Date;
  updatedAt: Date;
  suspendedAt: Date | null;
  metadata: Record<string, unknown>;
};

/** Map a database row (snake_case) to a Tenant object (camelCase). */
function rowToTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    plan: row.plan as string,
    status: row.status as string,
    settings: (row.settings ?? {}) as Record<string, unknown>,
    dataRegion: (row.data_region as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    suspendedAt: row.suspended_at ? new Date(row.suspended_at as string) : null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

export async function createTenant(data: {
  slug: string;
  name: string;
  plan?: string;
  settings?: Record<string, unknown>;
  dataRegion?: string;
}): Promise<Tenant> {
  const { slug, name, plan, settings, dataRegion } = data;
  const result = await query(
    `INSERT INTO tenants (slug, name, plan, settings, data_region)
     VALUES ($1, $2, COALESCE($3, 'starter'), COALESCE($4::jsonb, '{}'::jsonb), $5)
     RETURNING *`,
    [slug, name, plan ?? null, settings ? JSON.stringify(settings) : null, dataRegion ?? null],
  );
  return rowToTenant(result.rows[0]);
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  const result = await query("SELECT * FROM tenants WHERE id = $1", [id]);
  return result.rows.length > 0 ? rowToTenant(result.rows[0]) : null;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const result = await query("SELECT * FROM tenants WHERE slug = $1", [slug]);
  return result.rows.length > 0 ? rowToTenant(result.rows[0]) : null;
}

export async function listTenants(filters?: {
  status?: string;
  plan?: string;
  limit?: number;
  offset?: number;
}): Promise<{ tenants: Tenant[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.plan) {
    conditions.push(`plan = $${idx++}`);
    params.push(filters.plan);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM tenants ${where}`, params);
  const total: number = countResult.rows[0].total;

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  const result = await query(
    `SELECT * FROM tenants ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  return { tenants: result.rows.map(rowToTenant), total };
}

export async function updateTenant(
  id: string,
  data: Partial<{
    name: string;
    plan: string;
    status: string;
    settings: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>,
): Promise<Tenant> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${idx++}`);
    params.push(data.name);
  }
  if (data.plan !== undefined) {
    setClauses.push(`plan = $${idx++}`);
    params.push(data.plan);
  }
  if (data.status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    params.push(data.status);
  }
  if (data.settings !== undefined) {
    setClauses.push(`settings = $${idx++}::jsonb`);
    params.push(JSON.stringify(data.settings));
  }
  if (data.metadata !== undefined) {
    setClauses.push(`metadata = $${idx++}::jsonb`);
    params.push(JSON.stringify(data.metadata));
  }

  if (setClauses.length === 0) {
    const existing = await getTenantById(id);
    if (!existing) throw new Error(`Tenant not found: ${id}`);
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(id);

  const result = await query(
    `UPDATE tenants SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw new Error(`Tenant not found: ${id}`);
  }
  return rowToTenant(result.rows[0]);
}

export async function suspendTenant(id: string): Promise<void> {
  const result = await query(
    `UPDATE tenants SET status = 'suspended', suspended_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id],
  );
  if (result.rowCount === 0) {
    throw new Error(`Tenant not found: ${id}`);
  }
}

export async function activateTenant(id: string): Promise<void> {
  const result = await query(
    `UPDATE tenants SET status = 'active', suspended_at = NULL, updated_at = NOW() WHERE id = $1`,
    [id],
  );
  if (result.rowCount === 0) {
    throw new Error(`Tenant not found: ${id}`);
  }
}

export async function deleteTenant(id: string): Promise<void> {
  const result = await query("DELETE FROM tenants WHERE id = $1", [id]);
  if (result.rowCount === 0) {
    throw new Error(`Tenant not found: ${id}`);
  }
}
