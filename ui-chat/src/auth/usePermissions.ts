import { useCallback, useMemo } from "react";
import { useAuth } from "./useAuth";

export function usePermissions() {
  const { user } = useAuth();

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user?.permissions]);

  const isSuperAdmin = useMemo(() => permissions.has("*"), [permissions]);

  const hasPermission = useCallback(
    (permission: string): boolean => isSuperAdmin || permissions.has(permission),
    [permissions, isSuperAdmin],
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => isSuperAdmin || perms.some((p) => permissions.has(p)),
    [permissions, isSuperAdmin],
  );

  const hasAllPermissions = useCallback(
    (perms: string[]): boolean => isSuperAdmin || perms.every((p) => permissions.has(p)),
    [permissions, isSuperAdmin],
  );

  const canAccess = useCallback(
    (resource: string, action: string): boolean =>
      isSuperAdmin || permissions.has(`${resource}:${action}`),
    [permissions, isSuperAdmin],
  );

  return { hasPermission, hasAnyPermission, hasAllPermissions, canAccess };
}
