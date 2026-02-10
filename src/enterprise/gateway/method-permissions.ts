/**
 * Cérebro - Gateway Method Permission Mapping
 *
 * Maps every WebSocket gateway method to the RBAC permissions required to invoke it.
 * Permissions reference the central registry in ../rbac/permissions.ts.
 */

export type MethodPermissionRule = {
  /** Required permissions -- caller must hold ANY of these (unless requireAll is set). */
  permissions: string[];
  /** When true the caller must hold ALL listed permissions, not just one. */
  requireAll?: boolean;
  /** When true the method is accessible without authentication (health checks, etc.). */
  allowUnauthenticated?: boolean;
  /** Whether invocations of this method should be recorded in the audit log. */
  audit?: boolean;
  /** Severity level for audit entries. Defaults to 'info' when audit is enabled. */
  auditSeverity?: "info" | "warn" | "critical";
};

// ---------------------------------------------------------------------------
// Permission map -- every key corresponds to a method exported from
// gateway/server-methods-list.ts  (BASE_METHODS + channel plugin methods).
// ---------------------------------------------------------------------------

export const METHOD_PERMISSIONS: Record<string, MethodPermissionRule> = {
  // ── Health / Status ────────────────────────────────────────────────
  health: { permissions: [], allowUnauthenticated: true },
  status: { permissions: [], allowUnauthenticated: true },
  "last-heartbeat": { permissions: [], allowUnauthenticated: true },
  "set-heartbeats": { permissions: ["admin:config"], audit: true },

  // ── Configuration ──────────────────────────────────────────────────
  "config.get": { permissions: ["admin:config"], audit: true },
  "config.set": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "config.apply": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "config.patch": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "config.schema": { permissions: ["admin:config"] },

  // ── Agent / Chat ───────────────────────────────────────────────────
  agent: { permissions: ["agent:chat"], audit: true },
  "agent.identity.get": { permissions: ["agent:chat"] },
  "agent.wait": { permissions: ["agent:chat"] },
  send: { permissions: ["agent:chat"], audit: true },
  "chat.history": { permissions: ["agent:view_own_history", "agent:view_all_history"] },
  "chat.send": { permissions: ["agent:chat"], audit: true },
  "chat.abort": { permissions: ["agent:chat"] },

  // ── Sessions ───────────────────────────────────────────────────────
  "sessions.list": {
    permissions: ["agent:view_own_history", "agent:view_team_history", "agent:view_all_history"],
  },
  "sessions.preview": { permissions: ["agent:view_own_history", "agent:view_all_history"] },
  "sessions.patch": {
    permissions: ["agent:manage_sessions", "agent:manage_own_sessions"],
    audit: true,
  },
  "sessions.reset": {
    permissions: ["agent:manage_sessions", "agent:manage_own_sessions"],
    audit: true,
    auditSeverity: "warn",
  },
  "sessions.delete": { permissions: ["agent:manage_sessions"], audit: true, auditSeverity: "warn" },
  "sessions.compact": { permissions: ["agent:manage_sessions", "agent:manage_own_sessions"] },

  // ── Models ─────────────────────────────────────────────────────────
  "models.list": { permissions: ["agent:chat"] },

  // ── Agents management ──────────────────────────────────────────────
  "agents.list": { permissions: ["admin:agents", "agent:chat"] },
  "agents.files.list": { permissions: ["admin:agents"] },
  "agents.files.get": { permissions: ["admin:agents"] },
  "agents.files.set": { permissions: ["admin:agents"], audit: true },

  // ── Skills ─────────────────────────────────────────────────────────
  "skills.status": { permissions: ["skills:use"] },
  "skills.bins": { permissions: ["skills:use"] },
  "skills.install": { permissions: ["skills:manage"], audit: true },
  "skills.update": { permissions: ["skills:manage"], audit: true },

  // ── Channels ───────────────────────────────────────────────────────
  "channels.status": { permissions: ["admin:channels", "agent:chat"] },
  "channels.logout": { permissions: ["admin:channels"], audit: true, auditSeverity: "warn" },

  // ── Logs ───────────────────────────────────────────────────────────
  "logs.tail": { permissions: ["admin:audit"] },

  // ── Usage / Billing ────────────────────────────────────────────────
  "usage.status": { permissions: ["admin:dashboard", "admin:reports"] },
  "usage.cost": { permissions: ["admin:dashboard", "admin:billing"] },

  // ── TTS (Text-to-Speech) ───────────────────────────────────────────
  "tts.status": { permissions: ["agent:chat"] },
  "tts.providers": { permissions: ["agent:chat"] },
  "tts.enable": { permissions: ["admin:config"], audit: true },
  "tts.disable": { permissions: ["admin:config"], audit: true },
  "tts.convert": { permissions: ["agent:chat"] },
  "tts.setProvider": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },

  // ── Exec Approvals ─────────────────────────────────────────────────
  "exec.approvals.get": { permissions: ["admin:config", "tools:exec"] },
  "exec.approvals.set": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "exec.approvals.node.get": { permissions: ["admin:config", "tools:exec"] },
  "exec.approvals.node.set": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "exec.approval.request": { permissions: ["tools:exec"], audit: true },
  "exec.approval.resolve": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },

  // ── Wizard ─────────────────────────────────────────────────────────
  "wizard.start": { permissions: ["admin:config"], audit: true },
  "wizard.next": { permissions: ["admin:config"], audit: true },
  "wizard.cancel": { permissions: ["admin:config"], audit: true },
  "wizard.status": { permissions: ["admin:config"] },

  // ── Talk mode ──────────────────────────────────────────────────────
  "talk.mode": { permissions: ["agent:chat"] },

  // ── Voice wake ─────────────────────────────────────────────────────
  "voicewake.get": { permissions: ["agent:chat"] },
  "voicewake.set": { permissions: ["admin:config"], audit: true },

  // ── Wake ───────────────────────────────────────────────────────────
  wake: { permissions: ["agent:chat"] },

  // ── Node pairing ───────────────────────────────────────────────────
  "node.pair.request": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "node.pair.list": { permissions: ["admin:config"] },
  "node.pair.approve": { permissions: ["admin:config"], audit: true, auditSeverity: "critical" },
  "node.pair.reject": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "node.pair.verify": { permissions: ["admin:config"], audit: true },

  // ── Device pairing ────────────────────────────────────────────────
  "device.pair.list": { permissions: ["admin:security"] },
  "device.pair.approve": {
    permissions: ["admin:security"],
    audit: true,
    auditSeverity: "critical",
  },
  "device.pair.reject": { permissions: ["admin:security"], audit: true, auditSeverity: "warn" },
  "device.token.rotate": {
    permissions: ["admin:security"],
    audit: true,
    auditSeverity: "critical",
  },
  "device.token.revoke": {
    permissions: ["admin:security"],
    audit: true,
    auditSeverity: "critical",
  },

  // ── Node management ───────────────────────────────────────────────
  "node.rename": { permissions: ["admin:config"], audit: true },
  "node.list": { permissions: ["admin:config"] },
  "node.describe": { permissions: ["admin:config"] },
  "node.invoke": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "node.invoke.result": { permissions: ["admin:config"] },
  "node.event": { permissions: ["admin:config"] },

  // ── Cron ───────────────────────────────────────────────────────────
  "cron.list": { permissions: ["admin:config"] },
  "cron.status": { permissions: ["admin:config"] },
  "cron.add": { permissions: ["admin:config"], audit: true },
  "cron.update": { permissions: ["admin:config"], audit: true },
  "cron.remove": { permissions: ["admin:config"], audit: true, auditSeverity: "warn" },
  "cron.run": { permissions: ["admin:config"], audit: true },
  "cron.runs": { permissions: ["admin:config"] },

  // ── System ─────────────────────────────────────────────────────────
  "system-presence": { permissions: ["agent:chat"] },
  "system-event": { permissions: ["admin:config"] },

  // ── Browser ────────────────────────────────────────────────────────
  "browser.request": { permissions: ["tools:browse"], audit: true },

  // ── Update ─────────────────────────────────────────────────────────
  "update.run": { permissions: ["admin:config"], audit: true, auditSeverity: "critical" },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns the permission rule for a gateway method, or undefined for unknown methods.
 */
export function getMethodPermissions(method: string): MethodPermissionRule | undefined {
  return METHOD_PERMISSIONS[method];
}

/**
 * Checks whether a set of user permissions satisfies the requirements for a method.
 *
 * - Unknown methods are denied by default.
 * - Methods with `allowUnauthenticated` pass regardless of user permissions.
 * - When `requireAll` is set every listed permission must be present.
 * - Otherwise at least one listed permission must be present.
 * - The wildcard permission ('*') always grants access.
 */
export function isMethodAllowed(method: string, userPermissions: string[]): boolean {
  const rule = METHOD_PERMISSIONS[method];
  if (!rule) {
    return false;
  }

  if (rule.allowUnauthenticated) {
    return true;
  }

  if (userPermissions.includes("*")) {
    return true;
  }

  if (rule.permissions.length === 0) {
    return true;
  }

  if (rule.requireAll) {
    return rule.permissions.every((p) => userPermissions.includes(p));
  }

  return rule.permissions.some((p) => userPermissions.includes(p));
}

/**
 * Returns true when invocations of this method should be written to the audit log.
 */
export function shouldAuditMethod(method: string): boolean {
  const rule = METHOD_PERMISSIONS[method];
  return rule?.audit === true;
}

/**
 * Returns the audit severity for a method, defaulting to 'info' when audit is
 * enabled but no explicit severity is set.
 */
export function getAuditSeverity(method: string): "info" | "warn" | "critical" {
  const rule = METHOD_PERMISSIONS[method];
  if (!rule?.audit) {
    return "info";
  }
  return rule.auditSeverity ?? "info";
}
