import { EventEmitter } from "events";

interface AuditEvent {
  id: string;
  tenantId: string;
  action: string;
  actorId: string;
  severity: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

class AuditStreamManager {
  private emitters = new Map<string, EventEmitter>();

  getEmitter(tenantId: string): EventEmitter {
    if (!this.emitters.has(tenantId)) {
      const emitter = new EventEmitter();
      emitter.setMaxListeners(100);
      this.emitters.set(tenantId, emitter);
    }
    return this.emitters.get(tenantId)!;
  }

  emit(event: AuditEvent): void {
    const emitter = this.emitters.get(event.tenantId);
    if (emitter) {
      emitter.emit("audit", event);
    }
  }

  subscribe(tenantId: string, listener: (event: AuditEvent) => void): () => void {
    const emitter = this.getEmitter(tenantId);
    emitter.on("audit", listener);
    return () => emitter.off("audit", listener);
  }
}

export const auditStreamManager = new AuditStreamManager();
export type { AuditEvent };
