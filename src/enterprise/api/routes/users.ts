import { Hono } from "hono";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import { getAuditLogger } from "../../audit/audit-logger.js";
import { hashPassword, validatePasswordStrength } from "../../auth/password.js";
import {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  deactivateUser,
  bulkCreateUsers,
  assignRole,
  removeRole,
  getUserRoles,
} from "../../db/repositories/user-repo.js";
import { badRequest, notFound, conflict } from "../errors.js";
import { jwtAuthMiddleware, requirePermission, auditRoute } from "../middleware/index.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const listUsersQuerySchema = paginationSchema.extend({
  department: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().optional(),
  department: z.string().optional(),
  employeeId: z.string().optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  department: z.string().optional(),
  employeeId: z.string().optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const assignRoleSchema = z.object({
  roleId: z.string().min(1),
});

const bulkImportUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  department: z.string().optional(),
  employeeId: z.string().optional(),
});

const bulkImportSchema = z.object({
  users: z.array(bulkImportUserSchema).min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTenantContext(c: { get(key: "tenantContext"): TenantContext }): TenantContext {
  const ctx = c.get("tenantContext");
  if (!ctx) throw new Error("Missing tenant context");
  return ctx;
}

function stripSensitive(user: Record<string, unknown>) {
  const { passwordHash, mfaSecret, ...safe } = user;
  return safe;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const users = new Hono();

// All routes require JWT auth
users.use("*", jwtAuthMiddleware());

// GET /users - list users (admin:users:view)
users.get("/", requirePermission("admin:users:view"), async (c) => {
  const ctx = getTenantContext(c);
  const parsed = listUsersQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }
  const { department, status, search, limit, offset } = parsed.data;

  const result = await listUsers(ctx.tenantId, {
    department,
    status,
    search,
    limit,
    offset,
  });

  const safeUsers = result.users.map((u) =>
    stripSensitive(u as unknown as Record<string, unknown>),
  );
  return c.json({ users: safeUsers, total: result.total });
});

// POST /users - create user (admin:users)
users.post(
  "/",
  requirePermission("admin:users"),
  auditRoute({
    action: "user.created",
    resourceType: "user",
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const body = await c.req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { email, name, password, department, employeeId, status: userStatus } = parsed.data;

    let passwordHash: string | undefined;
    if (password) {
      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return badRequest(c, "Weak password", strength.errors);
      }
      passwordHash = await hashPassword(password);
    }

    try {
      const user = await createUser(ctx.tenantId, {
        email,
        name,
        department,
        employeeId,
        passwordHash,
        status: userStatus,
      });

      const safe = stripSensitive(user as unknown as Record<string, unknown>);
      return c.json(safe, 201);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("duplicate") || message.includes("unique")) {
        return conflict(c, "A user with this email already exists");
      }
      throw err;
    }
  },
);

// GET /users/:id - get user details (admin:users:view)
users.get("/:id", requirePermission("admin:users:view"), async (c) => {
  const ctx = getTenantContext(c);
  const userId = c.req.param("id");
  const user = await getUserById(ctx.tenantId, userId);

  if (!user) {
    return notFound(c, "User");
  }

  const roles = await getUserRoles(ctx.tenantId, userId);
  const safe = stripSensitive(user as unknown as Record<string, unknown>);
  return c.json({ ...safe, roles });
});

// PATCH /users/:id - update user (admin:users)
users.patch(
  "/:id",
  requirePermission("admin:users"),
  auditRoute({
    action: "user.updated",
    resourceType: "user",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const userId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { email, name, department, employeeId, status: userStatus, metadata } = parsed.data;

    try {
      const user = await updateUser(ctx.tenantId, userId, {
        email,
        name,
        department,
        employeeId,
        status: userStatus,
        metadata,
      });

      const safe = stripSensitive(user as unknown as Record<string, unknown>);
      return c.json(safe);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("not found")) {
        return notFound(c, "User");
      }
      throw err;
    }
  },
);

// DELETE /users/:id - deactivate user (admin:users)
users.delete(
  "/:id",
  requirePermission("admin:users"),
  auditRoute({
    action: "user.deactivated",
    resourceType: "user",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const userId = c.req.param("id");

    try {
      await deactivateUser(ctx.tenantId, userId);
      return c.body(null, 204);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("not found")) {
        return notFound(c, "User");
      }
      throw err;
    }
  },
);

// POST /users/:id/invite - send invite (admin:users)
users.post(
  "/:id/invite",
  requirePermission("admin:users"),
  auditRoute({
    action: "user.invited",
    resourceType: "user",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const userId = c.req.param("id");

    const user = await getUserById(ctx.tenantId, userId);
    if (!user) {
      return notFound(c, "User");
    }

    // Generate a time-limited invite token
    const inviteToken = crypto.randomUUID();

    await getAuditLogger().logAdminAction(
      ctx.tenantId,
      ctx.userId,
      "user.invited",
      "user",
      userId,
      { inviteeEmail: user.email },
    );

    return c.json({ inviteToken, expiresIn: 86400 }, 201);
  },
);

// POST /users/:id/roles - assign role (admin:roles)
users.post(
  "/:id/roles",
  requirePermission("admin:roles"),
  auditRoute({
    action: "user.role_assigned",
    resourceType: "user",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const userId = c.req.param("id");
    const body = await c.req.json();
    const parsed = assignRoleSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { roleId } = parsed.data;

    const user = await getUserById(ctx.tenantId, userId);
    if (!user) {
      return notFound(c, "User");
    }

    await assignRole(userId, roleId, ctx.userId);

    const roles = await getUserRoles(ctx.tenantId, userId);
    return c.json({ roles });
  },
);

// DELETE /users/:id/roles/:roleId - remove role (admin:roles)
users.delete(
  "/:id/roles/:roleId",
  requirePermission("admin:roles"),
  auditRoute({
    action: "user.role_removed",
    resourceType: "user",
    resourceId: (rc) => rc.params.id,
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const userId = c.req.param("id");
    const roleId = c.req.param("roleId");

    const user = await getUserById(ctx.tenantId, userId);
    if (!user) {
      return notFound(c, "User");
    }

    await removeRole(userId, roleId);
    return c.body(null, 204);
  },
);

// POST /users/bulk-import - CSV/JSON bulk import (admin:users)
users.post(
  "/bulk-import",
  requirePermission("admin:users"),
  auditRoute({
    action: "user.bulk_imported",
    resourceType: "user",
    statusFilter: (s) => s < 400,
  }),
  async (c) => {
    const ctx = getTenantContext(c);
    const body = await c.req.json();
    const parsed = bulkImportSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(c, "Validation error", parsed.error.issues);
    }
    const { users: usersData } = parsed.data;

    try {
      const created = await bulkCreateUsers(ctx.tenantId, usersData);
      const safeUsers = created.map((u) => stripSensitive(u as unknown as Record<string, unknown>));
      return c.json({ users: safeUsers, count: safeUsers.length }, 201);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("duplicate") || message.includes("unique")) {
        return conflict(c, "One or more users have duplicate emails");
      }
      throw err;
    }
  },
);

export const userRoutes = users;
