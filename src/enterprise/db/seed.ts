import { hashPassword } from "../auth/password.js";
/**
 * Seed script: creates demo tenant, admin user, default roles, and a sample agent.
 * Usage: npx tsx --env-file=.env src/enterprise/db/seed.ts
 */
import { query, closePool } from "./connection.js";
import { seedDefaultRoles } from "./repositories/role-repo.js";

const TENANT_SLUG = "demo-corp";
const ADMIN_EMAIL = "admin@demo-corp.com";
const ADMIN_PASSWORD = "Admin123!";
const ADMIN_NAME = "Admin User";

async function seed() {
  console.log("Seeding Cérebro...\n");

  // 1. Create tenant
  const tenantResult = await query(
    `INSERT INTO tenants (slug, name, plan, status, settings)
     VALUES ($1, $2, 'starter', 'active', '{}')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [TENANT_SLUG, "Demo Corporation"],
  );
  const tenantId = tenantResult.rows[0].id;
  console.log(`  Tenant: ${TENANT_SLUG} (${tenantId})`);

  // 2. Seed default roles
  await seedDefaultRoles(tenantId);
  console.log("  Roles: super-admin, admin, manager, employee, viewer");

  // 3. Get super-admin role
  const roleResult = await query(
    `SELECT id FROM roles WHERE tenant_id = $1 AND name = 'super-admin'`,
    [tenantId],
  );
  const roleId = roleResult.rows[0].id;

  // 4. Create admin user
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const userResult = await query(
    `INSERT INTO users (tenant_id, email, name, department, password_hash, status)
     VALUES ($1, $2, $3, 'Management', $4, 'active')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [tenantId, ADMIN_EMAIL, ADMIN_NAME, passwordHash],
  );
  const userId = userResult.rows[0].id;
  console.log(`  User: ${ADMIN_EMAIL} (${userId})`);

  // 5. Assign super-admin role
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, roleId],
  );
  console.log("  Role assigned: super-admin");

  // 6. Create a sample agent
  await query(
    `INSERT INTO agent_configs (tenant_id, agent_id, config)
     VALUES ($1, 'main', $2)
     ON CONFLICT (tenant_id, agent_id) DO UPDATE SET config = EXCLUDED.config`,
    [
      tenantId,
      JSON.stringify({
        name: "OpenClaw Assistant",
        description: "Default AI assistant",
        model: "claude-sonnet-4-5-20250514",
        status: "active",
        isDefault: true,
        systemPrompt: "You are a helpful assistant.",
        parameters: { temperature: 0.7, maxTokens: 4096, responseLanguage: "auto" },
      }),
    ],
  );
  console.log("  Agent: OpenClaw Assistant (main)");

  console.log("\n--- Seed complete ---");
  console.log(`\n  Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log("  Admin UI: http://localhost:5173");
  console.log("  Chat UI:  http://localhost:5174\n");

  await closePool();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
