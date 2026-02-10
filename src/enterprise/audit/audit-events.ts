// Audit event type definitions for Cérebro
// Each event maps to a specific user or system action that should be logged.

// ---------------------------------------------------------------------------
// Event type union
// ---------------------------------------------------------------------------

export type AuditEventType =
  // Auth
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.token_refresh"
  | "auth.mfa_enabled"
  | "auth.mfa_disabled"
  | "auth.mfa_failed"
  | "auth.password_changed"
  | "auth.password_reset"
  | "auth.register"
  | "auth.register_failed"
  | "auth.account_locked"
  // User management
  | "user.created"
  | "user.updated"
  | "user.deactivated"
  | "user.reactivated"
  | "user.invited"
  | "user.role_assigned"
  | "user.role_removed"
  | "user.bulk_imported"
  // Agent interactions
  | "agent.chat.started"
  | "agent.chat.message_sent"
  | "agent.chat.message_received"
  | "agent.chat.completed"
  | "agent.chat.aborted"
  | "agent.tool.invoked"
  | "agent.tool.completed"
  | "agent.tool.blocked"
  | "agent.tool.error"
  // Sessions
  | "session.created"
  | "session.accessed"
  | "session.reset"
  | "session.deleted"
  | "session.exported"
  | "session.compacted"
  // Configuration
  | "config.viewed"
  | "config.updated"
  | "config.agent_modified"
  | "config.channel_connected"
  | "config.channel_disconnected"
  // Compliance
  | "compliance.policy_created"
  | "compliance.policy_updated"
  | "compliance.policy_deleted"
  | "compliance.violation_detected"
  | "compliance.content_filtered"
  | "compliance.usage_limit_exceeded"
  | "compliance.data_retention_enforced"
  // Admin
  | "admin.role_created"
  | "admin.role_updated"
  | "admin.role_deleted"
  | "admin.tenant_settings_changed"
  | "admin.security_settings_changed"
  | "admin.skill_installed"
  | "admin.skill_removed"
  // Privacy
  | "privacy.dsar_submitted"
  | "privacy.erasure_requested"
  | "privacy.data_exported"
  | "privacy.consent_updated";

// ---------------------------------------------------------------------------
// Severity levels
// ---------------------------------------------------------------------------

export type AuditSeverity = "info" | "warn" | "critical";

// ---------------------------------------------------------------------------
// Audit event input (what callers pass to the logger)
// ---------------------------------------------------------------------------

export type AuditEvent = {
  tenantId: string;
  userId?: string;
  action: AuditEventType;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  sessionKey?: string;
  severity?: AuditSeverity;
};

// ---------------------------------------------------------------------------
// Default severity mapping
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Partial<Record<AuditEventType, AuditSeverity>> = {
  // Auth failures
  "auth.login_failed": "warn",
  "auth.mfa_failed": "warn",
  "auth.mfa_disabled": "warn",
  "auth.register_failed": "warn",
  "auth.account_locked": "warn",

  // User management - destructive / sensitive
  "user.deactivated": "warn",
  "user.role_removed": "warn",
  "user.bulk_imported": "warn",

  // Agent interactions - errors / blocks
  "agent.tool.blocked": "warn",
  "agent.tool.error": "warn",
  "agent.chat.aborted": "warn",

  // Sessions - destructive
  "session.deleted": "warn",
  "session.reset": "warn",

  // Configuration changes
  "config.updated": "warn",
  "config.agent_modified": "warn",
  "config.channel_disconnected": "warn",

  // Compliance
  "compliance.policy_deleted": "warn",
  "compliance.violation_detected": "critical",
  "compliance.content_filtered": "warn",
  "compliance.usage_limit_exceeded": "warn",
  "compliance.data_retention_enforced": "warn",

  // Admin - destructive / sensitive
  "admin.role_deleted": "warn",
  "admin.tenant_settings_changed": "warn",
  "admin.security_settings_changed": "critical",
  "admin.skill_removed": "warn",

  // Privacy - all are sensitive
  "privacy.dsar_submitted": "warn",
  "privacy.erasure_requested": "critical",
  "privacy.data_exported": "warn",
  "privacy.consent_updated": "warn",
};

export function getDefaultSeverity(action: AuditEventType): AuditSeverity {
  return SEVERITY_MAP[action] ?? "info";
}
