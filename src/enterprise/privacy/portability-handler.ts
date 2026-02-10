import { query } from "../db/connection.js";
import { logger } from "../lib/logger.js";
import { listUserConsents } from "./consent-manager.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortableUserData {
  exportedAt: string;
  format: "json";
  tenantId: string;
  userId: string;
  profile: Record<string, unknown>;
  consents: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  auditLog: Record<string, unknown>[];
  usageRecords: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Data export
// ---------------------------------------------------------------------------

/**
 * Export all personal data for a user in a machine-readable format.
 *
 * Implements the LGPD/GDPR "right to data portability". The result is a
 * JSON-serialisable structure that can be returned via API or written to a
 * file for download.
 */
export async function exportUserData(tenantId: string, userId: string): Promise<PortableUserData> {
  const [profile, consents, sessions, auditLog, usageRecords] = await Promise.all([
    fetchUserProfile(tenantId, userId),
    listUserConsents(tenantId, userId),
    fetchUserSessions(tenantId, userId),
    fetchUserAuditLog(tenantId, userId),
    fetchUserUsageRecords(tenantId, userId),
  ]);

  logger.info("User data exported for portability", { userId, tenantId });

  return {
    exportedAt: new Date().toISOString(),
    format: "json",
    tenantId,
    userId,
    profile,
    consents: consents.map((c) => ({ ...c })),
    sessions,
    auditLog,
    usageRecords,
  };
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchUserProfile(
  tenantId: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT id, email, name, status, created_at, updated_at, last_login_at, metadata
     FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  if (!result.rows[0]) return {};

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    metadata: row.metadata,
  };
}

async function fetchUserSessions(
  tenantId: string,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT session_key, created_at, updated_at, metadata
     FROM sessions WHERE tenant_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 1000`,
    [tenantId, userId],
  );
  return result.rows.map((row) => ({
    sessionKey: row.session_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata,
  }));
}

async function fetchUserAuditLog(
  tenantId: string,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT action, resource_type, resource_id, details, created_at
     FROM audit_log WHERE tenant_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 5000`,
    [tenantId, userId],
  );
  return result.rows.map((row) => ({
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    details: row.details,
    createdAt: row.created_at,
  }));
}

async function fetchUserUsageRecords(
  tenantId: string,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT agent_id, model_id, tokens_input, tokens_output, cost_usd, created_at
     FROM usage_records WHERE tenant_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 5000`,
    [tenantId, userId],
  );
  return result.rows.map((row) => ({
    agentId: row.agent_id,
    modelId: row.model_id,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    costUsd: row.cost_usd,
    createdAt: row.created_at,
  }));
}
