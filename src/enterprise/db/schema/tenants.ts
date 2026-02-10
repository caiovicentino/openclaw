import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 64 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  plan: varchar("plan", { length: 32 }).default("starter"),
  status: varchar("status", { length: 16 }).default("active"),
  settings: jsonb("settings").default({}),
  dataRegion: varchar("data_region", { length: 16 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),
});
