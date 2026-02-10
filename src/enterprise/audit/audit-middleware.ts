import type { MiddlewareHandler } from "hono";
import type { TenantContext } from "../context/tenant-context.js";
import type { AuditEvent, AuditEventType, AuditSeverity } from "./audit-events.js";
import { shouldAuditMethod, getAuditSeverity } from "../gateway/method-permissions.js";
import { getAuditLogger } from "./audit-logger.js";

function auditAsync(event: AuditEvent): void {
  getAuditLogger()
    .log(event)
    .catch((err) => {
      console.error("[audit] Failed to log event:", event.action, err);
    });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditMiddlewareOptions = {
  /** The audit action to log. If a function, resolved per-request. */
  action: AuditEventType | ((c: AuditRequestContext) => AuditEventType);
  /** Resource type for the audit entry. */
  resourceType?: string;
  /** Extract the resource ID from the request context. */
  resourceId?: string | ((c: AuditRequestContext) => string | undefined);
  /** Additional details to include. */
  details?: (c: AuditRequestContext) => Record<string, unknown>;
  /** Override severity. */
  severity?: AuditSeverity;
  /** Only log when the response status satisfies this predicate. Default: always. */
  statusFilter?: (status: number) => boolean;
};

type AuditRequestContext = {
  method: string;
  path: string;
  status: number;
  tenantContext: TenantContext | null;
  params: Record<string, string>;
  durationMs: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTenantContext(c: { get(key: "tenantContext"): TenantContext }): TenantContext | null {
  try {
    return c.get("tenantContext") ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Specific audit middleware (for individual routes)
// ---------------------------------------------------------------------------

/**
 * Create a Hono middleware that logs an audit event after the handler runs.
 *
 * Place after `jwtAuthMiddleware()` to have access to `tenantContext`.
 *
 * @example
 * ```ts
 * app.delete(
 *   "/agents/:id",
 *   jwtAuthMiddleware(),
 *   auditRoute({ action: AUDIT_AGENT_DELETED, resourceType: "agent", resourceId: (c) => c.params.id }),
 *   handler,
 * );
 * ```
 */
export function auditRoute(opts: AuditMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    const ctx = getTenantContext(c);
    const status = c.res.status;

    if (opts.statusFilter && !opts.statusFilter(status)) {
      return;
    }

    const reqCtx: AuditRequestContext = {
      method: c.req.method,
      path: c.req.path,
      status,
      tenantContext: ctx,
      params: c.req.param() as Record<string, string>,
      durationMs,
    };

    if (!ctx) return;

    const action = typeof opts.action === "function" ? opts.action(reqCtx) : opts.action;
    const resourceId =
      typeof opts.resourceId === "function" ? opts.resourceId(reqCtx) : opts.resourceId;

    auditAsync({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action,
      resourceType: opts.resourceType,
      resourceId,
      details: {
        method: reqCtx.method,
        path: reqCtx.path,
        status: reqCtx.status,
        durationMs: reqCtx.durationMs,
        ...(opts.details ? opts.details(reqCtx) : {}),
      },
      ipAddress: ctx.ipAddress,
      sessionKey: ctx.sessionId,
      severity: opts.severity,
    });
  };
}

// ---------------------------------------------------------------------------
// Blanket request audit middleware (auto-audit all requests)
// ---------------------------------------------------------------------------

type RequestAuditOptions = {
  /** Action to use for all auto-logged requests. */
  defaultAction?: AuditEventType;
  /** Skip auditing for these path prefixes. */
  excludePaths?: string[];
  /** Only log responses with these status ranges. Default: all. */
  statusFilter?: (status: number) => boolean;
};

/**
 * Blanket middleware that logs an audit entry for every authenticated request.
 *
 * Useful as a catch-all at the app level for compliance purposes.
 *
 * @example
 * ```ts
 * app.use("*", jwtAuthMiddleware(), requestAuditMiddleware({ excludePaths: ["/health"] }));
 * ```
 */
export function requestAuditMiddleware(opts?: RequestAuditOptions): MiddlewareHandler {
  const excludePaths = opts?.excludePaths ?? [];

  return async (c, next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    const path = c.req.path;

    if (excludePaths.some((prefix) => path.startsWith(prefix))) {
      return;
    }

    if (opts?.statusFilter && !opts.statusFilter(c.res.status)) {
      return;
    }

    const ctx = getTenantContext(c);
    if (!ctx) return;

    const method = c.req.method;
    const status = c.res.status;

    // Map HTTP method to a generic action if no default is provided
    const action = opts?.defaultAction ?? (`http.${method.toLowerCase()}` as AuditEventType);

    auditAsync({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action,
      details: {
        method,
        path,
        status,
        durationMs,
        userAgent: c.req.header("User-Agent"),
      },
      ipAddress: ctx.ipAddress,
      sessionKey: ctx.sessionId,
      severity: status >= 500 ? "critical" : status >= 400 ? "warn" : "info",
    });
  };
}

// ---------------------------------------------------------------------------
// Auth failure audit middleware
// ---------------------------------------------------------------------------

/**
 * Middleware that audits failed authentication attempts (401 responses).
 *
 * Place this BEFORE auth middleware to capture failed attempts even when
 * tenantContext is unavailable.
 *
 * @example
 * ```ts
 * app.use("*", authFailureAuditMiddleware(), jwtAuthMiddleware());
 * ```
 */
export function authFailureAuditMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    if (c.res.status === 401) {
      const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();

      // Try to get a tenantId from auth header or query params for context
      const ctx = getTenantContext(c);

      auditAsync({
        tenantId: ctx?.tenantId ?? "unknown",
        userId: ctx?.userId,
        action: "auth.login_failed",
        details: {
          method: c.req.method,
          path: c.req.path,
          userAgent: c.req.header("User-Agent"),
        },
        ipAddress: ip,
        severity: "warn",
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Sensitive field sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "secret",
  "token",
  "apiKey",
  "mfaSecret",
  "cookie",
  "authorization",
]);

/**
 * Remove sensitive fields from audit details before persisting.
 *
 * Strips keys like `password`, `token`, `apiKey`, `mfaSecret`, etc. to
 * prevent credentials from leaking into audit logs.
 */
export function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue;
    }

    // Recurse one level into nested plain objects
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Auto-audit Hono middleware (maps HTTP verbs to audit actions)
// ---------------------------------------------------------------------------

/** Map HTTP method + first path segment to an audit action string. */
function deriveAuditEventType(method: string, path: string): AuditEventType {
  // Extract the primary resource from the path: /api/users/123 -> "user"
  const segments = path.replace(/^\/+/, "").split("/");
  // Skip the "api" prefix if present
  const resourceSegment =
    segments[0] === "api" ? (segments[1] ?? "resource") : (segments[0] ?? "resource");

  // Singularise naively (strip trailing 's')
  const resource =
    resourceSegment.endsWith("s") && resourceSegment.length > 1
      ? resourceSegment.slice(0, -1)
      : resourceSegment;

  const verb = method.toUpperCase();
  const verbMap: Record<string, string> = {
    POST: "created",
    PUT: "updated",
    PATCH: "updated",
    DELETE: "deleted",
    GET: "accessed",
  };

  const action = verbMap[verb] ?? "accessed";
  return `${resource}.${action}` as AuditEventType;
}

/**
 * Auto-audit middleware that records every authenticated HTTP request.
 *
 * Derives the audit action from the HTTP method and path, includes IP
 * address and User-Agent, and measures request duration.
 *
 * @example
 * ```ts
 * app.use("*", jwtAuthMiddleware(), auditMiddleware());
 * ```
 */
export function auditMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    const ctx = getTenantContext(c);
    if (!ctx) return;

    const method = c.req.method;
    const path = c.req.path;
    const status = c.res.status;

    const action = deriveAuditEventType(method, path);
    const ip = ctx.ipAddress ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
    const userAgent = c.req.header("User-Agent");

    auditAsync({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action,
      details: {
        method,
        path,
        status,
        durationMs,
        userAgent,
      },
      ipAddress: ip,
      sessionKey: ctx.sessionId,
      severity: status >= 500 ? "critical" : status >= 400 ? "warn" : "info",
    });
  };
}

// ---------------------------------------------------------------------------
// WebSocket method audit wrapper
// ---------------------------------------------------------------------------

/**
 * Audit a WebSocket gateway method invocation.
 *
 * Checks the `METHOD_PERMISSIONS` map to decide if the method should be
 * audited. When enabled, logs via `AuditLogger` with sanitized params
 * (passwords, tokens, etc. are stripped).
 *
 * @param method - The gateway method name (e.g. "sessions.delete")
 * @param tenantId - Caller's tenant ID
 * @param userId - Caller's user ID
 * @param params - The method parameters (will be sanitized)
 * @param result - The method result (included as summary, not full payload)
 */
export async function auditWsMethod(
  method: string,
  tenantId: string,
  userId: string,
  params: unknown,
  result: unknown,
): Promise<void> {
  if (!shouldAuditMethod(method)) {
    return;
  }

  const severity = getAuditSeverity(method);

  const rawParams =
    params !== null && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {};

  const details: Record<string, unknown> = {
    method,
    params: sanitizeAuditDetails(rawParams),
    success: result !== undefined && result !== null,
  };

  auditAsync({
    tenantId,
    userId,
    action: `ws.${method}` as AuditEventType,
    details,
    severity,
  });
}
