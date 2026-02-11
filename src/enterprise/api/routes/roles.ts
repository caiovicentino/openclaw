import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import {
  createRole,
  getRoleById,
  listRoles,
  deleteRole,
  getUsersWithRole,
} from "../../db/repositories/role-repo.js";
import { updateRoleSafe } from "../../rbac/roles.js";
import { badRequest, forbidden, notFound, conflict } from "../errors.js";
import { jwtAuthMiddleware, requirePermission, auditRoute } from "../middleware/index.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const listRolesQuerySchema = paginationSchema.extend({
  department: z.string().optional(),
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  department: z.string().optional(),
  permissions: z.array(z.string()).default([]),
});

const updateRoleSchema = z.object({
  displayName: z.string().optional(),
  department: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTenantContext(c: { get(key: "tenantContext"): TenantContext }): TenantContext {
  const ctx = c.get("tenantContext");
  if (!ctx) throw new Error("Missing tenant context");
  return ctx;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const roles = new Hono();

// All routes require JWT auth
roles.use("*", jwtAuthMiddleware());

// GET /roles - list roles (admin:roles)
roles.get("/", requirePermission("admin:roles"), async (c) => {
  const ctx = getTenantContext(c);
  const parsed = listRolesQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }
  const { department, limit, offset } = parsed.data;

  const result = await listRoles(ctx.tenantId, {
    department,
    limit,
    offset,
  });

  return c.json({ roles: result.roles, total: result.total });
});

// POST /roles - create role (admin:roles)
roles.post(
  "/",
  requirePermission("admin:roles"),
  auditRoute({
    action: "admin.role_created",
    resourceType: "role",
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const body = await c.req.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { name, displayName, department, permissions } = parsed.data;

    try {
      const role = await createRole(ctx.tenantId, {
        name,
        displayName,
        department,
        permissions,
      });

      return c.json(role, 201);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("duplicate") || message.includes("unique")) {
        return conflict(c, "A role with this name already exists");
      }
      throw err;
    }
  },
);

// GET /roles/:id - get role details (admin:roles)
roles.get("/:id", requirePermission("admin:roles"), async (c) => {
  const ctx = getTenantContext(c);
  const roleId = c.req.param("id");
  const role = await getRoleById(ctx.tenantId, roleId);

  if (!role) {
    return notFound(c, "Role");
  }

  const members = await getUsersWithRole(ctx.tenantId, roleId);
  return c.json({ ...role, members });
});

// PATCH /roles/:id - update role permissions (admin:roles)
roles.patch(
  "/:id",
  requirePermission("admin:roles"),
  auditRoute({
    action: "admin.role_updated",
    resourceType: "role",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const roleId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { displayName, department, permissions } = parsed.data;

    try {
      const role = await updateRoleSafe(ctx.tenantId, roleId, {
        displayName,
        department,
        permissions,
      });

      if (!role) {
        return notFound(c, "Role");
      }

      return c.json(role);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("not found")) {
        return notFound(c, "Role");
      }
      throw err;
    }
  },
);

// DELETE /roles/:id - delete role (admin:roles) - blocks system roles
roles.delete(
  "/:id",
  requirePermission("admin:roles"),
  auditRoute({
    action: "admin.role_deleted",
    resourceType: "role",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const roleId = c.req.param("id");

    try {
      await deleteRole(ctx.tenantId, roleId);
      return c.body(null, 204);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("not found")) {
        return notFound(c, "Role");
      }
      if (message.includes("system role")) {
        return forbidden(c, "Cannot delete a system role");
      }
      throw err;
    }
  },
);

export const roleRoutes = roles;
