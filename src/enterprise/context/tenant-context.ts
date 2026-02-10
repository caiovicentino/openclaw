export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  userEmail: string;
  userName: string;
  department: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
  requestId: string;
  ipAddress?: string;
};

export type TenantContextInput = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  userEmail: string;
  userName: string;
  department: string;
  roles: string[];
  permissions: string[];
  ipAddress?: string;
};

export function createTenantContext(input: TenantContextInput): TenantContext {
  return {
    ...input,
    requestId: crypto.randomUUID(),
  };
}

export function hasPermission(ctx: TenantContext, permission: string): boolean {
  for (const granted of ctx.permissions) {
    if (granted === "*") return true;
    if (granted === permission) return true;
    // Prefix wildcard: "tools:*" matches "tools:exec", "admin:user:*" matches "admin:user:create"
    if (granted.endsWith(":*") && permission.startsWith(granted.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

export function hasAnyPermission(ctx: TenantContext, permissions: readonly string[]): boolean {
  return permissions.some((p) => hasPermission(ctx, p));
}

export function hasAllPermissions(ctx: TenantContext, permissions: readonly string[]): boolean {
  return permissions.every((p) => hasPermission(ctx, p));
}

export function isDepartment(ctx: TenantContext, department: string): boolean {
  return ctx.department.toLowerCase() === department.toLowerCase();
}
