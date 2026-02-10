/**
 * User Bridge — resolves Stack Auth identities to local user records.
 *
 * Three strategies, tried in order:
 *  1. Lookup by stack_auth_id (fast path for returning users)
 *  2. Lookup by email in the default tenant, then link the stack_auth_id
 *  3. Auto-provision a new local user (when STACK_AUTH_AUTO_PROVISION=true)
 */

import type { StackAuthPayload } from "./stack-auth.js";
import { getRoleByName } from "../db/repositories/role-repo.js";
import { getTenantBySlug } from "../db/repositories/tenant-repo.js";
import {
  getUserByStackAuthId,
  getUserByEmail,
  linkStackAuthId,
  createUserFromStackAuth,
  getUserRoles,
  getUserPermissions,
} from "../db/repositories/user-repo.js";
import { assignRole } from "../db/repositories/user-repo.js";

export type ResolvedUser = {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  name: string;
  department: string;
  roles: string[];
  permissions: string[];
};

function getDefaultTenantSlug(): string {
  return process.env.DEFAULT_TENANT_SLUG ?? "demo-corp";
}

export async function resolveStackAuthUser(payload: StackAuthPayload): Promise<ResolvedUser> {
  // ── Strategy 1: lookup by stack_auth_id ──
  const existing = await getUserByStackAuthId(payload.sub);
  if (existing) {
    const roles = await getUserRoles(existing.tenantId, existing.id);
    const roleNames = roles.map((r) => r.name);
    const permissions = await getUserPermissions(existing.tenantId, existing.id);

    // Resolve tenant slug
    const tenant = await getTenantBySlug(getDefaultTenantSlug());
    const tenantSlug = tenant?.slug ?? getDefaultTenantSlug();

    return {
      userId: existing.id,
      tenantId: existing.tenantId,
      tenantSlug,
      email: existing.email,
      name: existing.name ?? "",
      department: existing.department ?? "",
      roles: roleNames,
      permissions,
    };
  }

  // ── Resolve default tenant ──
  const tenantSlug = getDefaultTenantSlug();
  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) {
    throw new Error(`Default tenant "${tenantSlug}" not found`);
  }

  // ── Strategy 2: lookup by email, then link ──
  if (payload.email) {
    const byEmail = await getUserByEmail(tenant.id, payload.email);
    if (byEmail) {
      await linkStackAuthId(tenant.id, byEmail.id, payload.sub);

      const roles = await getUserRoles(tenant.id, byEmail.id);
      const roleNames = roles.map((r) => r.name);
      const permissions = await getUserPermissions(tenant.id, byEmail.id);

      return {
        userId: byEmail.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        email: byEmail.email,
        name: byEmail.name ?? "",
        department: byEmail.department ?? "",
        roles: roleNames,
        permissions,
      };
    }
  }

  // ── Strategy 3: auto-provision ──
  const autoProvision = process.env.STACK_AUTH_AUTO_PROVISION === "true";
  if (!autoProvision) {
    throw new Error("User not found and auto-provisioning is disabled");
  }

  const newUser = await createUserFromStackAuth(tenant.id, {
    email: payload.email,
    name: payload.name || payload.email,
    stackAuthId: payload.sub,
  });

  // Assign default role if configured
  const defaultRoleName = process.env.STACK_AUTH_DEFAULT_ROLE;
  if (defaultRoleName) {
    const role = await getRoleByName(tenant.id, defaultRoleName);
    if (role) {
      await assignRole(newUser.id, role.id);
    }
  }

  const roles = await getUserRoles(tenant.id, newUser.id);
  const roleNames = roles.map((r) => r.name);
  const permissions = await getUserPermissions(tenant.id, newUser.id);

  return {
    userId: newUser.id,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    email: newUser.email,
    name: newUser.name ?? "",
    department: newUser.department ?? "",
    roles: roleNames,
    permissions,
  };
}
