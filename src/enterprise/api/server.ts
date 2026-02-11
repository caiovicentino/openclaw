/**
 * Standalone Enterprise Admin API server.
 * Usage: npx tsx src/enterprise/api/server.ts
 */
import { serve } from "@hono/node-server";
import { baileysManager } from "../channels/baileys-manager.js";
import { ensureBreachTable, ensureConsentTable, ensureDsarTable } from "../privacy/index.js";
import { getTaskScheduler } from "../services/scheduler/task-scheduler.js";
import { createEnterpriseApi } from "./router.js";

const port = Number(process.env.ADMIN_API_PORT) || 3000;

const app = createEnterpriseApi();

console.log(`Cérebro API starting on http://localhost:${port}`);
console.log(`  Database: ${process.env.DATABASE_URL ?? "(not set)"}`);
console.log(`  Redis:    ${process.env.REDIS_URL ?? "(not set)"}`);
console.log(`  Mode:     ${process.env.NODE_ENV ?? "development"}`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Cérebro API running at http://localhost:${info.port}/api/v1`);
  // Bootstrap privacy tables (idempotent CREATE IF NOT EXISTS)
  Promise.all([ensureDsarTable(), ensureConsentTable(), ensureBreachTable()]).catch(console.error);
  getTaskScheduler().start().catch(console.error);
  baileysManager.reconnectAll().catch(console.error);
});
