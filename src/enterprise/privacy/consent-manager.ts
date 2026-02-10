import { query, withTransaction } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsentPurpose =
  | "data_processing"
  | "ai_training"
  | "analytics"
  | "marketing"
  | "third_party_sharing"
  | "cross_border_transfer";

export interface ConsentRecord {
  id: string;
  tenantId: string;
  userId: string;
  userName: string | null;
  purpose: ConsentPurpose;
  granted: boolean;
  version: string;
  ipAddress: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
}

export interface GrantConsentInput {
  tenantId: string;
  userId: string;
  purpose: ConsentPurpose;
  version: string;
  ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Consent table bootstrap
// ---------------------------------------------------------------------------

const ENSURE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS consent_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     VARCHAR(64) NOT NULL,
    granted     BOOLEAN NOT NULL DEFAULT TRUE,
    version     VARCHAR(32) NOT NULL,
    ip_address  INET,
    granted_at  TIMESTAMPTZ DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ,
    UNIQUE (tenant_id, user_id, purpose)
  )
`;

export async function ensureConsentTable(): Promise<void> {
  await query(ENSURE_TABLE_SQL);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Record or update a user's consent for a given purpose. */
export async function grantConsent(input: GrantConsentInput): Promise<ConsentRecord> {
  const result = await query<Record<string, unknown>>(
    `INSERT INTO consent_records (tenant_id, user_id, purpose, granted, version, ip_address)
     VALUES ($1, $2, $3, TRUE, $4, $5::inet)
     ON CONFLICT (tenant_id, user_id, purpose)
       DO UPDATE SET granted = TRUE, version = $4, ip_address = $5::inet,
                     granted_at = NOW(), revoked_at = NULL
     RETURNING *`,
    [input.tenantId, input.userId, input.purpose, input.version, input.ipAddress ?? null],
  );
  return toConsentRecord(result.rows[0]);
}

/** Revoke a user's consent for a given purpose. */
export async function revokeConsent(
  tenantId: string,
  userId: string,
  purpose: ConsentPurpose,
): Promise<void> {
  await query(
    `UPDATE consent_records
     SET granted = FALSE, revoked_at = NOW()
     WHERE tenant_id = $1 AND user_id = $2 AND purpose = $3`,
    [tenantId, userId, purpose],
  );
}

/** Revoke all consents for a user (e.g. during account deletion). */
export async function revokeAllConsents(tenantId: string, userId: string): Promise<void> {
  await query(
    `UPDATE consent_records
     SET granted = FALSE, revoked_at = NOW()
     WHERE tenant_id = $1 AND user_id = $2 AND granted = TRUE`,
    [tenantId, userId],
  );
}

/** Check whether a user has active consent for a specific purpose. */
export async function hasConsent(
  tenantId: string,
  userId: string,
  purpose: ConsentPurpose,
): Promise<boolean> {
  const result = await query<{ granted: boolean }>(
    `SELECT granted FROM consent_records
     WHERE tenant_id = $1 AND user_id = $2 AND purpose = $3`,
    [tenantId, userId, purpose],
  );
  return result.rows[0]?.granted === true;
}

/** List all consent records for a user (for DSAR / data export). */
export async function listUserConsents(tenantId: string, userId: string): Promise<ConsentRecord[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM consent_records
     WHERE tenant_id = $1 AND user_id = $2
     ORDER BY purpose`,
    [tenantId, userId],
  );
  return result.rows.map(toConsentRecord);
}

/** List all consent records for a tenant, with optional user name search. */
export async function listTenantConsents(
  tenantId: string,
  filters?: { search?: string; limit?: number; offset?: number },
): Promise<ConsentRecord[]> {
  const conditions: string[] = ["c.tenant_id = $1"];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.search) {
    conditions.push(`u.name ILIKE $${idx++}`);
    params.push(`%${filters.search}%`);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  params.push(limit, offset);

  const result = await query<Record<string, unknown>>(
    `SELECT c.*, u.name AS user_name FROM consent_records c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY u.name, c.purpose
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );

  return result.rows.map(toConsentRecord);
}

/** Bulk-grant consents within a transaction (e.g. onboarding flow). */
export async function grantBulkConsents(inputs: GrantConsentInput[]): Promise<void> {
  await withTransaction(async (client) => {
    for (const input of inputs) {
      await client.query(
        `INSERT INTO consent_records (tenant_id, user_id, purpose, granted, version, ip_address)
         VALUES ($1, $2, $3, TRUE, $4, $5::inet)
         ON CONFLICT (tenant_id, user_id, purpose)
           DO UPDATE SET granted = TRUE, version = $4, ip_address = $5::inet,
                         granted_at = NOW(), revoked_at = NULL`,
        [input.tenantId, input.userId, input.purpose, input.version, input.ipAddress ?? null],
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toConsentRecord(row: Record<string, unknown>): ConsentRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    userId: row.user_id as string,
    userName: (row.user_name as string) ?? null,
    purpose: row.purpose as ConsentPurpose,
    granted: row.granted as boolean,
    version: row.version as string,
    ipAddress: (row.ip_address as string) ?? null,
    grantedAt: row.granted_at as Date,
    revokedAt: (row.revoked_at as Date) ?? null,
  };
}
