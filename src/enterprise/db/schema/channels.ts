import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { agentConfigs } from "./agent-configs";
import { tenants } from "./tenants";

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  config: jsonb("config").default({}),
  enabled: boolean("enabled").default(true),
  agentId: uuid("agent_id").references(() => agentConfigs.id),
  webhookSecret: varchar("webhook_secret", { length: 255 }),
  webhookUrl: text("webhook_url"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const channelMessages = pgTable("channel_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  externalId: varchar("external_id", { length: 255 }),
  direction: varchar("direction", { length: 10 }).notNull(),
  senderId: varchar("sender_id", { length: 255 }),
  senderName: varchar("sender_name", { length: 255 }),
  content: text("content"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
