import { pgTable, uuid, varchar, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  targetType: varchar("target_type", { length: 20 }).notNull(),
  targetId: varchar("target_id", { length: 255 }),
  limitType: varchar("limit_type", { length: 30 }).notNull(),
  limitValue: numeric("limit_value").notNull(),
  warningThreshold: numeric("warning_threshold").default("0.8"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
