import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { logger } from "../lib/logger.js";

let pool: Pool | null = null;

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  const poolConfig = connectionString
    ? {
        connectionString,
        max: parseInt(process.env.PG_POOL_MAX ?? "20", 10),
        idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT ?? "30000", 10),
        connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT ?? "5000", 10),
        ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.PG_HOST ?? "localhost",
        port: parseInt(process.env.PG_PORT ?? "5432", 10),
        database: process.env.PG_DATABASE ?? "cerebro",
        user: process.env.PG_USER ?? "postgres",
        password: process.env.PG_PASSWORD ?? "",
        max: parseInt(process.env.PG_POOL_MAX ?? "20", 10),
        idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT ?? "30000", 10),
        connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT ?? "5000", 10),
      };

  return new Pool(poolConfig);
}

/** Returns the singleton connection pool, creating it on first call. */
export function getPool(): Pool {
  if (!pool) {
    pool = createPool();

    pool.on("error", (err) => {
      logger.error("Unexpected error on idle client", { error: String(err) });
    });
  }
  return pool;
}

/** Gracefully shuts down the connection pool. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Execute a parameterised query using an auto-acquired client. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/**
 * Run a callback inside a database transaction.
 *
 * The transaction is automatically committed when the callback resolves and
 * rolled back if it throws.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
