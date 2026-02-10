import * as fs from "fs";
import * as path from "path";
import { query, withTransaction } from "./connection.js";

const MIGRATIONS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "migrations");

const MIGRATIONS_TABLE = "_migrations";

/** Ensure the migrations tracking table exists. */
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/** Return the set of migration filenames that have already been applied. */
async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await query<{ name: string }>(
    `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name`,
  );
  return new Set(result.rows.map((r) => r.name));
}

/** Discover all .sql files in the migrations directory, sorted by name. */
function discoverMigrations(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Run all pending database migrations in order.
 *
 * Each migration is executed inside its own transaction. A record is inserted
 * into the `_migrations` table after each successful run so it will not be
 * applied again.
 */
export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const allFiles = discoverMigrations();
  const pending = allFiles.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("[migrate] All migrations are up to date.");
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s) to apply.`);

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    console.log(`[migrate] Applying ${file} ...`);

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [file]);
    });

    console.log(`[migrate] Applied  ${file}`);
  }

  console.log("[migrate] All migrations applied successfully.");
}
