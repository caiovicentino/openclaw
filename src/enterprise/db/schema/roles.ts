import {
  pgTable,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }),
    department: varchar("department", { length: 128 }),
    permissions: jsonb("permissions").default([]),
    isSystemRole: boolean("is_system_role").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueTenantName: unique().on(table.tenantId, table.name),
  }),
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
    grantedBy: uuid("granted_by").references(() => users.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.roleId] }),
  }),
);
