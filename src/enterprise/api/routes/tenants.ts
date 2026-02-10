import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { seedDefaultRoles } from "../../db/repositories/role-repo.js";
import {
  createTenant,
  getTenantById,
  getTenantBySlug,
  listTenants,
  updateTenant,
  suspendTenant,
  activateTenant,
  deleteTenant,
} from "../../db/repositories/tenant-repo.js";
import { badRequest, forbidden, notFound, conflict } from "../errors.js";
import { jwtAuthMiddleware, requireRole, auditRoute } from "../middleware/index.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const listTenantsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  plan: z.string().optional(),
});

const createTenantSchema = z.object({
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'slug must be lowercase alphanumeric with hyphens (e.g. "my-company")',
    ),
  name: z.string().min(1),
  plan: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  dataRegion: z.string().optional(),
  seedRoles: z.boolean().optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  plan: z.string().optional(),
  status: z.enum(["active", "suspended", "inactive"]).optional(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const deleteTenantSchema = z.object({
  confirm: z.literal(true),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTenantContext(c: { get(key: "tenantContext"): TenantContext }): TenantContext {
  const ctx = c.get("tenantContext");
  if (!ctx) throw new Error("Missing tenant context");
  return ctx;
}

/** Check if the caller is a super-admin. */
function isSuperAdmin(ctx: TenantContext): boolean {
  return ctx.roles.includes("super-admin") || ctx.permissions.includes("*");
}

/** Check if the caller can access a specific tenant (super-admin or own tenant admin). */
function canAccessTenant(ctx: TenantContext, tenantId: string): boolean {
  if (isSuperAdmin(ctx)) return true;
  return ctx.tenantId === tenantId && ctx.roles.includes("admin");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const tenants = new Hono();

// All routes require JWT auth
tenants.use("*", jwtAuthMiddleware());

// GET /tenants - list tenants (super-admin only)
tenants.get("/", requireRole("super-admin"), async (c) => {
  const parsed = listTenantsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }
  const { status, plan, limit, offset } = parsed.data;

  const result = await listTenants({
    status,
    plan,
    limit,
    offset,
  });

  return c.json({ tenants: result.tenants, total: result.total });
});

// POST /tenants - create tenant (super-admin)
tenants.post(
  "/",
  requireRole("super-admin"),
  auditRoute({
    action: "admin.tenant_settings_changed",
    resourceType: "tenant",
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const body = await c.req.json();
    const parsed = createTenantSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { slug, name, plan, settings, dataRegion, seedRoles } = parsed.data;

    try {
      const tenant = await createTenant({
        slug,
        name,
        plan,
        settings,
        dataRegion,
      });

      // Seed default roles unless explicitly disabled
      if (seedRoles !== false) {
        await seedDefaultRoles(tenant.id);
      }

      return c.json(tenant, 201);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("duplicate") || message.includes("unique")) {
        return conflict(c, "A tenant with this slug already exists");
      }
      throw err;
    }
  },
);

// GET /tenants/:id - get tenant (super-admin or own tenant admin)
tenants.get("/:id", async (c) => {
  const ctx = getTenantContext(c);
  const tenantId = c.req.param("id");

  if (!canAccessTenant(ctx, tenantId)) {
    return forbidden(c, "Insufficient permissions");
  }

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    return notFound(c, "Tenant");
  }

  return c.json(tenant);
});

// PATCH /tenants/:id - update tenant (super-admin)
tenants.patch(
  "/:id",
  requireRole("super-admin"),
  auditRoute({
    action: "admin.tenant_settings_changed",
    resourceType: "tenant",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const tenantId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateTenantSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { name, plan, status, settings, metadata } = parsed.data;

    try {
      const tenant = await updateTenant(tenantId, {
        name,
        plan,
        status,
        settings,
        metadata,
      });

      return c.json(tenant);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("not found")) {
        return notFound(c, "Tenant");
      }
      throw err;
    }
  },
);

// DELETE /tenants/:id - delete tenant (super-admin)
tenants.delete(
  "/:id",
  requireRole("super-admin"),
  auditRoute({
    action: "admin.tenant_settings_changed",
    resourceType: "tenant",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
    severity: "critical",
  }),
  async (c) => {
    const tenantId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const parsed = deleteTenantSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }

    try {
      await deleteTenant(tenantId);
      return c.body(null, 204);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("not found")) {
        return notFound(c, "Tenant");
      }
      throw err;
    }
  },
);

export const tenantRoutes = tenants;
