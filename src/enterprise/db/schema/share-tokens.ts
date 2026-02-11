import { pgTable, uuid, varchar, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { tenants } from "./tenants";

export const shareTokens = pgTable("share_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  token: varchar("token", { length: 64 }).unique().notNull(),
  accessType: varchar("access_type", { length: 20 }).default("read_only"),
  includeToolOutputs: boolean("include_tool_outputs").default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxViews: integer("max_views"),
  viewCount: integer("view_count").default(0),
  revoked: boolean("revoked").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
