import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  decimal,
  bigserial,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const compliancePolicies = pgTable("compliance_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description"),
  type: varchar("type", { length: 64 }).notNull(),
  rules: jsonb("rules").default({}),
  enabled: boolean("enabled").default(true),
  severity: varchar("severity", { length: 16 }).default("medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
});

export const usageRecords = pgTable("usage_records", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  agentId: varchar("agent_id", { length: 64 }).notNull(),
  sessionKey: varchar("session_key", { length: 512 }),
  modelProvider: varchar("model_provider", { length: 64 }),
  modelId: varchar("model_id", { length: 128 }),
  tokensInput: integer("tokens_input").default(0),
  tokensOutput: integer("tokens_output").default(0),
  costUsd: decimal("cost_usd", { precision: 10, scale: 6 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
