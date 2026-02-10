import type { AuditEvent } from "./audit-stream.js";
import { query } from "../db/connection.js";

export async function checkAlertRules(event: AuditEvent): Promise<void> {
  const rules = await query(
    `SELECT * FROM audit_alert_rules WHERE tenant_id = $1 AND enabled = true`,
    [event.tenantId],
  );

  for (const rule of rules.rows) {
    const conditions = rule.conditions as Record<string, unknown>;
    let matches = true;

    if (conditions.action_pattern) {
      const pattern = conditions.action_pattern as string;
      if (!event.action.includes(pattern)) matches = false;
    }
    if (conditions.severity) {
      if (event.severity !== conditions.severity) matches = false;
    }

    if (matches) {
      await query(
        `INSERT INTO audit_alerts (tenant_id, rule_id, event_id, details)
         VALUES ($1, $2, $3, $4)`,
        [
          event.tenantId,
          rule.id,
          event.id,
          JSON.stringify({ action: event.action, actor: event.actorId }),
        ],
      );
    }
  }
}
