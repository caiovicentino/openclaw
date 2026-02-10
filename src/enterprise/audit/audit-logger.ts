import type { AuditEvent, AuditEventType, AuditSeverity } from "./audit-events.js";
import { logger } from "../lib/logger.js";
import { getDefaultSeverity } from "./audit-events.js";

// ---------------------------------------------------------------------------
// AuditLogger - buffered audit event logger
// ---------------------------------------------------------------------------

type BufferedEvent = AuditEvent & { _retryCount?: number };

export class AuditLogger {
  private buffer: BufferedEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private flushSize: number;
  private flushIntervalMs: number;
  private maxRetries: number;
  private maxBufferSize: number;

  constructor(options?: {
    flushSize?: number;
    flushIntervalMs?: number;
    maxRetries?: number;
    maxBufferSize?: number;
  }) {
    this.flushSize = options?.flushSize ?? 50;
    this.flushIntervalMs = options?.flushIntervalMs ?? 5000;
    this.maxRetries = options?.maxRetries ?? 3;
    this.maxBufferSize = options?.maxBufferSize ?? 10_000;
  }

  // -------------------------------------------------------------------------
  // Core log method
  // -------------------------------------------------------------------------

  async log(event: AuditEvent): Promise<void> {
    const resolved: BufferedEvent = {
      ...event,
      severity: event.severity ?? getDefaultSeverity(event.action),
    };

    if (this.buffer.length >= this.maxBufferSize) {
      const dropCount = Math.max(1, Math.floor(this.maxBufferSize * 0.1));
      logger.warn("Audit buffer full, dropping oldest events", {
        bufferSize: this.buffer.length,
        maxBufferSize: this.maxBufferSize,
        dropCount,
      });
      this.buffer.splice(0, dropCount);
    }

    this.buffer.push(resolved);

    if (this.buffer.length >= this.flushSize) {
      await this.flush();
    }
  }

  // -------------------------------------------------------------------------
  // Convenience methods
  // -------------------------------------------------------------------------

  async logAuth(
    tenantId: string,
    userId: string,
    action: AuditEventType,
    details?: Record<string, unknown>,
    ip?: string,
  ): Promise<void> {
    await this.log({
      tenantId,
      userId,
      action,
      details,
      ipAddress: ip,
    });
  }

  async logAgentAction(
    tenantId: string,
    userId: string,
    action: AuditEventType,
    sessionKey: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.log({
      tenantId,
      userId,
      action,
      sessionKey,
      details,
    });
  }

  async logAdminAction(
    tenantId: string,
    userId: string,
    action: AuditEventType,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.log({
      tenantId,
      userId,
      action,
      resourceType,
      resourceId,
      details,
    });
  }

  async logComplianceEvent(
    tenantId: string,
    action: AuditEventType,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.log({
      tenantId,
      action,
      details,
    });
  }

  // -------------------------------------------------------------------------
  // Flush / lifecycle
  // -------------------------------------------------------------------------

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const batch = this.buffer.splice(0);

    // Bulk insert using a single multi-row INSERT statement.
    // Dynamic import avoids circular dependency at module load time.
    try {
      const { query } = await import("../db/connection.js");

      const columns = [
        "tenant_id",
        "user_id",
        "action",
        "resource_type",
        "resource_id",
        "details",
        "ip_address",
        "user_agent",
        "session_key",
        "severity",
      ];
      const colCount = columns.length;
      const valuePlaceholders: string[] = [];
      const params: unknown[] = [];

      for (let i = 0; i < batch.length; i++) {
        const event = batch[i];
        const offset = i * colCount;
        const placeholders = columns.map((_, j) => `$${offset + j + 1}`);
        valuePlaceholders.push(`(${placeholders.join(", ")})`);
        params.push(
          event.tenantId,
          event.userId ?? null,
          event.action,
          event.resourceType ?? null,
          event.resourceId ?? null,
          event.details ? JSON.stringify(event.details) : "{}",
          event.ipAddress ?? null,
          event.userAgent ?? null,
          event.sessionKey ?? null,
          event.severity ?? "info",
        );
      }

      await query(
        `INSERT INTO audit_log (${columns.join(", ")}) VALUES ${valuePlaceholders.join(", ")}`,
        params,
      );
    } catch (err) {
      logger.error("Audit flush failed, re-queuing events", { error: String(err) });

      // Increment retry counts and only re-queue events under the limit.
      for (const event of batch) {
        const retries = (event._retryCount ?? 0) + 1;
        if (retries > this.maxRetries) {
          logger.error("Dropping audit event after max retries", {
            maxRetries: this.maxRetries,
            action: event.action,
            tenantId: event.tenantId,
          });
        } else {
          event._retryCount = retries;
          this.buffer.push(event);
        }
      }
    }
  }

  startPeriodicFlush(): void {
    if (this.flushInterval) {
      return;
    }
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        logger.error("Audit periodic flush error", { error: String(err) });
      });
    }, this.flushIntervalMs);

    // Allow the Node process to exit even if the interval is still active.
    if (typeof this.flushInterval === "object" && "unref" in this.flushInterval) {
      this.flushInterval.unref();
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!_instance) {
    _instance = new AuditLogger();
    _instance.startPeriodicFlush();
  }
  return _instance;
}

export function initAuditLogger(options?: {
  flushSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  maxBufferSize?: number;
}): AuditLogger {
  if (_instance) {
    // Shut down previous instance before replacing.
    _instance.shutdown().catch(() => {});
  }
  _instance = new AuditLogger(options);
  _instance.startPeriodicFlush();
  return _instance;
}
