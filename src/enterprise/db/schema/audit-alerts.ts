import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const auditAlertRules = pgTable("audit_alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  conditions: jsonb("conditions").notNull().default({}),
  notificationChannels: jsonb("notification_channels").default([]),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const auditAlerts = pgTable("audit_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  ruleId: uuid("rule_id")
    .notNull()
    .references(() => auditAlertRules.id, { onDelete: "cascade" }),
  eventId: uuid("event_id"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow(),
  details: jsonb("details").default({}),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: uuid("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});
