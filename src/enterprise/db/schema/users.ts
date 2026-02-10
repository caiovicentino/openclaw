import { pgTable, uuid, varchar, boolean, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    employeeId: varchar("employee_id", { length: 64 }),
    department: varchar("department", { length: 128 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    status: varchar("status", { length: 16 }).default("active"),
    mfaSecret: varchar("mfa_secret", { length: 255 }),
    mfaEnabled: boolean("mfa_enabled").default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    uniqueTenantEmail: unique().on(table.tenantId, table.email),
  }),
);
