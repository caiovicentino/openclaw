import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  bigserial,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 64 }).default("main"),
    sessionKey: varchar("session_key", { length: 512 }).notNull(),
    sessionData: jsonb("session_data").default({}),
    transcriptPath: varchar("transcript_path", { length: 512 }),
    status: varchar("status", { length: 16 }).default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    uniqueTenantAgentSession: unique().on(table.tenantId, table.agentId, table.sessionKey),
  }),
);

export const sessionTranscripts = pgTable("session_transcripts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  seqNum: integer("seq_num").notNull(),
  entryType: varchar("entry_type", { length: 32 }).notNull(),
  role: varchar("role", { length: 16 }),
  content: text("content"),
  metadata: jsonb("metadata").default({}),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
