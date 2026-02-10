import type {
  OpenClawPluginApi,
  OpenClawPluginDefinition,
  PluginHookAgentContext,
  PluginHookBeforeToolCallEvent,
  PluginHookAfterToolCallEvent,
  PluginHookSessionStartEvent,
  PluginHookSessionEndEvent,
  PluginHookSessionContext,
  PluginHookToolContext,
  PluginHookAgentEndEvent,
} from "../../plugins/types.js";
import type { AuditEventType } from "./audit-events.js";
import { getAuditLogger } from "./audit-logger.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type AuditPluginConfig = {
  /** Whether to audit agent chat start/end events. Default: true */
  logAgentChats: boolean;
  /** Whether to audit tool invocations. Default: true */
  logToolCalls: boolean;
  /** Whether to include tool results in audit details. Default: false (verbose) */
  logToolResults: boolean;
  /** Whether to audit session lifecycle events. Default: true */
  logSessionLifecycle: boolean;
};

const DEFAULT_AUDIT_PLUGIN_CONFIG: AuditPluginConfig = {
  logAgentChats: true,
  logToolCalls: true,
  logToolResults: false,
  logSessionLifecycle: true,
};

let currentAuditPluginConfig: AuditPluginConfig = { ...DEFAULT_AUDIT_PLUGIN_CONFIG };

type InternalPluginConfig = {
  /** Tenant ID to associate with plugin-originated audit events. */
  tenantId: string;
  /** User ID for the current user, if available. */
  userId?: string;
  /** Log every tool call (can be noisy). Default: true. */
  auditToolCalls?: boolean;
  /** Log session start/end events. Default: true. */
  auditSessions?: boolean;
  /** Log agent lifecycle events. Default: true. */
  auditAgentLifecycle?: boolean;
};

function resolveConfig(api: OpenClawPluginApi): InternalPluginConfig {
  const cfg = (api.pluginConfig ?? {}) as Partial<InternalPluginConfig>;
  return {
    tenantId: cfg.tenantId ?? process.env.CEREBRO_TENANT_ID ?? "unknown",
    userId: cfg.userId ?? process.env.CEREBRO_USER_ID,
    auditToolCalls: cfg.auditToolCalls ?? currentAuditPluginConfig.logToolCalls,
    auditSessions: cfg.auditSessions ?? currentAuditPluginConfig.logSessionLifecycle,
    auditAgentLifecycle: cfg.auditAgentLifecycle ?? currentAuditPluginConfig.logAgentChats,
  };
}

// ---------------------------------------------------------------------------
// Fire-and-forget helper (uses the buffered AuditLogger singleton)
// ---------------------------------------------------------------------------

function logAsync(
  action: AuditEventType,
  tenantId: string,
  opts?: {
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    severity?: "info" | "warn" | "critical";
  },
): void {
  getAuditLogger()
    .log({
      tenantId,
      userId: opts?.userId,
      action,
      resourceType: opts?.resourceType,
      resourceId: opts?.resourceId,
      details: opts?.details,
      severity: opts?.severity,
    })
    .catch((err) => {
      console.error("[enterprise-audit] Failed to log event:", action, err);
    });
}

// ---------------------------------------------------------------------------
// Hook handlers
// ---------------------------------------------------------------------------

function makeSessionStartHandler(cfg: InternalPluginConfig) {
  return (_event: PluginHookSessionStartEvent, ctx: PluginHookSessionContext): void => {
    logAsync("session.created", cfg.tenantId, {
      userId: cfg.userId,
      resourceType: "session",
      resourceId: ctx.sessionId,
      details: {
        agentId: ctx.agentId,
        resumedFrom: _event.resumedFrom,
      },
    });
  };
}

function makeSessionEndHandler(cfg: InternalPluginConfig) {
  return (_event: PluginHookSessionEndEvent, ctx: PluginHookSessionContext): void => {
    logAsync("session.deleted", cfg.tenantId, {
      userId: cfg.userId,
      resourceType: "session",
      resourceId: ctx.sessionId,
      details: {
        agentId: ctx.agentId,
        messageCount: _event.messageCount,
        durationMs: _event.durationMs,
      },
    });
  };
}

function makeBeforeToolCallHandler(cfg: InternalPluginConfig) {
  return (_event: PluginHookBeforeToolCallEvent, ctx: PluginHookToolContext): void => {
    logAsync("agent.tool.invoked", cfg.tenantId, {
      userId: cfg.userId,
      resourceType: "tool",
      resourceId: ctx.toolName,
      details: {
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
      },
    });
  };
}

function makeAfterToolCallHandler(cfg: InternalPluginConfig) {
  return (event: PluginHookAfterToolCallEvent, ctx: PluginHookToolContext): void => {
    if (event.error) {
      logAsync("agent.tool.error", cfg.tenantId, {
        userId: cfg.userId,
        resourceType: "tool",
        resourceId: ctx.toolName,
        details: {
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
          error: event.error,
          durationMs: event.durationMs,
        },
        severity: "warn",
      });
    } else {
      logAsync("agent.tool.completed", cfg.tenantId, {
        userId: cfg.userId,
        resourceType: "tool",
        resourceId: ctx.toolName,
        details: {
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
          durationMs: event.durationMs,
        },
      });
    }
  };
}

function makeAgentEndHandler(cfg: InternalPluginConfig) {
  return (event: PluginHookAgentEndEvent, ctx: PluginHookAgentContext): void => {
    logAsync("agent.chat.completed", cfg.tenantId, {
      userId: cfg.userId,
      resourceType: "agent",
      resourceId: ctx.agentId,
      details: {
        sessionKey: ctx.sessionKey,
        success: event.success,
        error: event.error,
        durationMs: event.durationMs,
        messageCount: event.messages.length,
      },
      severity: event.success ? "info" : "warn",
    });
  };
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

export const auditPlugin: OpenClawPluginDefinition = {
  id: "enterprise-audit",
  name: "Enterprise Audit",
  description:
    "Automatically logs agent lifecycle, session, and tool events to the enterprise audit log.",
  version: "1.0.0",

  register(api: OpenClawPluginApi): void {
    const cfg = resolveConfig(api);

    if (cfg.auditSessions) {
      api.on("session_start", makeSessionStartHandler(cfg));
      api.on("session_end", makeSessionEndHandler(cfg));
    }

    if (cfg.auditToolCalls) {
      api.on("before_tool_call", makeBeforeToolCallHandler(cfg));
      api.on("after_tool_call", makeAfterToolCallHandler(cfg));
    }

    if (cfg.auditAgentLifecycle) {
      api.on("agent_end", makeAgentEndHandler(cfg));
    }

    api.logger.info("[enterprise-audit] Audit plugin registered");
  },
};

export default auditPlugin;

// ---------------------------------------------------------------------------
// Convenience API for direct registration / configuration
// ---------------------------------------------------------------------------

let _registeredApi: OpenClawPluginApi | null = null;

/**
 * Register audit hooks with the plugin system using the given config.
 *
 * This is a convenience wrapper around `auditPlugin.register()` that also
 * applies `AuditPluginConfig` settings.
 */
export function registerAuditHooks(config?: Partial<AuditPluginConfig>): void {
  if (config) {
    currentAuditPluginConfig = { ...DEFAULT_AUDIT_PLUGIN_CONFIG, ...config };
  }

  // If we have a stored plugin API reference, re-register
  if (_registeredApi) {
    auditPlugin.register(_registeredApi);
  }
}

/**
 * Unregister all audit hooks from the plugin system.
 */
export function unregisterAuditHooks(): void {
  _registeredApi = null;
  currentAuditPluginConfig = { ...DEFAULT_AUDIT_PLUGIN_CONFIG };
}

/**
 * Returns a copy of the current audit plugin configuration.
 */
export function getAuditPluginConfig(): AuditPluginConfig {
  return { ...currentAuditPluginConfig };
}

/**
 * Store a reference to the plugin API so convenience functions can use it.
 * Called internally when the plugin is registered via the plugin system.
 */
export function _setPluginApi(api: OpenClawPluginApi): void {
  _registeredApi = api;
}
