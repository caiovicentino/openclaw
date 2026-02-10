import { pgTable, uuid, varchar, text, integer, bigint, unique } from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

const vector = customType<{ data: number[]; driverType: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") {
      return JSON.parse(value);
    }
    return value as number[];
  },
});

export const memoryFiles = pgTable(
  "memory_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 64 }).notNull(),
    path: text("path").notNull(),
    source: varchar("source", { length: 16 }).default("memory"),
    hash: varchar("hash", { length: 128 }).notNull(),
    mtime: bigint("mtime", { mode: "number" }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
  },
  (table) => ({
    uniqueTenantAgentPath: unique().on(table.tenantId, table.agentId, table.path),
  }),
);

export const memoryChunks = pgTable("memory_chunks", {
  id: varchar("id", { length: 128 }).primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id", { length: 64 }).notNull(),
  path: text("path").notNull(),
  source: varchar("source", { length: 16 }).default("memory"),
  startLine: integer("start_line").notNull(),
  endLine: integer("end_line").notNull(),
  hash: varchar("hash", { length: 128 }).notNull(),
  model: varchar("model", { length: 128 }).notNull(),
  text: text("text").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
