import { pgTable, uuid, varchar, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 64 }).default("main"),
    config: jsonb("config").default({}),
    version: integer("version").default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => ({
    uniqueTenantAgent: unique().on(table.tenantId, table.agentId),
  }),
);
