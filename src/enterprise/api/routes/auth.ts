/**
 * Enterprise Admin API - Authentication routes
 *
 * With Stack Auth handling identity/authentication, only profile and
 * logout endpoints remain. All login/register/refresh/SSO/password
 * flows are managed by Stack Auth directly.
 */

import { Hono } from "hono";
import { getUserById, getUserRoles } from "../../db/repositories/user-repo.js";
import { jwtAuthMiddleware } from "../middleware/index.js";

const auth = new Hono();

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

auth.post("/logout", (_c) => {
  // Stack Auth manages the session; we just acknowledge the request.
  return _c.json({ message: "Logged out successfully" });
});

// ---------------------------------------------------------------------------
// GET /auth/me  (authenticated)
// ---------------------------------------------------------------------------

auth.get("/me", jwtAuthMiddleware(), async (c) => {
  const ctx = c.get("tenantContext");
  const user = await getUserById(ctx.tenantId, ctx.userId);
  if (!user) {
    return c.json({ error: "Not Found", message: "User not found" }, 404);
  }

  const roles = await getUserRoles(ctx.tenantId, ctx.userId);

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    department: user.department,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    roles: roles.map((r) => ({ id: r.id, name: r.name, displayName: r.displayName })),
    permissions: ctx.permissions,
  });
});

export { auth };
export { auth as authRoutes };
