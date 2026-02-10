/**
 * Railway entrypoint: runs migrations then starts the API server.
 */
import { runMigrations } from "../../src/enterprise/db/migrate.js";

console.log("[entrypoint] Running database migrations...");
try {
  await runMigrations();
  console.log("[entrypoint] Migrations complete.");
} catch (err) {
  console.error(
    "[entrypoint] Migration error (non-fatal, continuing):",
    err instanceof Error ? err.message : err,
  );
}

console.log("[entrypoint] Starting API server...");
// Dynamic import to start server after migrations
await import("../../src/enterprise/api/server.js");
