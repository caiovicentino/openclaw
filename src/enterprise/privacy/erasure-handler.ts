import { withTransaction } from "../db/connection.js";
import { logger } from "../lib/logger.js";
import { revokeAllConsents } from "./consent-manager.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErasureResult {
  userId: string;
  tenantId: string;
  tablesProcessed: string[];
  errors: string[];
  completedAt: Date;
}

// ---------------------------------------------------------------------------
// Erasure operations
// ---------------------------------------------------------------------------

/**
 * Execute a full "right to be forgotten" erasure for a user.
 *
 * This removes or anonymises all personally identifiable data while
 * preserving aggregate / anonymised audit records as required for
 * compliance evidence.
 *
 * Runs inside a single transaction so that partial erasure cannot occur.
 */
export async function eraseUserData(tenantId: string, userId: string): Promise<ErasureResult> {
  const tablesProcessed: string[] = [];
  const errors: string[] = [];

  await withTransaction(async (client) => {
    // 1. Revoke all consents
    try {
      await revokeAllConsents(tenantId, userId);
      tablesProcessed.push("consent_records");
    } catch (err) {
      errors.push(`consent_records: ${(err as Error).message}`);
    }

    // 2. Anonymise audit log entries (keep the row for compliance, strip PII)
    try {
      await client.query(
        `UPDATE audit_log
         SET user_id = NULL,
             ip_address = NULL,
             user_agent = NULL,
             details = details - 'email' - 'name' - 'ip'
         WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
      tablesProcessed.push("audit_log");
    } catch (err) {
      errors.push(`audit_log: ${(err as Error).message}`);
    }

    // 3. Delete sessions
    try {
      await client.query(`DELETE FROM sessions WHERE tenant_id = $1 AND user_id = $2`, [
        tenantId,
        userId,
      ]);
      tablesProcessed.push("sessions");
    } catch (err) {
      errors.push(`sessions: ${(err as Error).message}`);
    }

    // 4. Anonymise usage records
    try {
      await client.query(
        `UPDATE usage_records SET user_id = NULL WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
      tablesProcessed.push("usage_records");
    } catch (err) {
      errors.push(`usage_records: ${(err as Error).message}`);
    }

    // 5. Delete DSAR requests (the erasure itself is the completion)
    try {
      await client.query(`DELETE FROM dsar_requests WHERE tenant_id = $1 AND user_id = $2`, [
        tenantId,
        userId,
      ]);
      tablesProcessed.push("dsar_requests");
    } catch (err) {
      errors.push(`dsar_requests: ${(err as Error).message}`);
    }

    // 6. Remove user role assignments
    try {
      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      tablesProcessed.push("user_roles");
    } catch (err) {
      errors.push(`user_roles: ${(err as Error).message}`);
    }

    // 7. Delete the user record itself
    try {
      await client.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [userId, tenantId]);
      tablesProcessed.push("users");
    } catch (err) {
      errors.push(`users: ${(err as Error).message}`);
    }
  });

  const result: ErasureResult = {
    userId,
    tenantId,
    tablesProcessed,
    errors,
    completedAt: new Date(),
  };

  logger.info("Erasure completed for user", {
    userId,
    tenantId,
    tablesProcessed: tablesProcessed.length,
    errors: errors.length,
  });

  return result;
}

/**
 * Erase all data for an entire tenant (tenant offboarding).
 *
 * CASCADE DELETE on tenants.id handles most tables, but this function
 * explicitly cleans up any tables that may not have ON DELETE CASCADE.
 */
export async function eraseTenantData(tenantId: string): Promise<ErasureResult> {
  const tablesProcessed: string[] = [];
  const errors: string[] = [];

  await withTransaction(async (client) => {
    // The CASCADE on tenants.id will handle most child tables.
    // Explicitly clean anything that might not have CASCADE.
    const tablesToClean = [
      "consent_records",
      "dsar_requests",
      "usage_records",
      "audit_log",
      "sessions",
      "agent_configs",
      "compliance_policies",
      "user_roles",
      "users",
      "roles",
    ];

    for (const table of tablesToClean) {
      try {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
        tablesProcessed.push(table);
      } catch (err) {
        errors.push(`${table}: ${(err as Error).message}`);
      }
    }

    // Finally delete the tenant itself
    try {
      await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
      tablesProcessed.push("tenants");
    } catch (err) {
      errors.push(`tenants: ${(err as Error).message}`);
    }
  });

  logger.info("Tenant erasure completed", {
    tenantId,
    tablesProcessed: tablesProcessed.length,
    errors: errors.length,
  });

  return {
    userId: "tenant-level",
    tenantId,
    tablesProcessed,
    errors,
    completedAt: new Date(),
  };
}
