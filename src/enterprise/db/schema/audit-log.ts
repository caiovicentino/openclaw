import { pgTable, uuid, varchar, jsonb, timestamp, bigserial, inet } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 128 }).notNull(),
  resourceType: varchar("resource_type", { length: 64 }),
  resourceId: varchar("resource_id", { length: 255 }),
  details: jsonb("details").default({}),
  ipAddress: inet("ip_address"),
  userAgent: varchar("user_agent", { length: 512 }),
  sessionKey: varchar("session_key", { length: 512 }),
  severity: varchar("severity", { length: 16 }).default("info"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
