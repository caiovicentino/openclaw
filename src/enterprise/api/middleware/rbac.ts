/**
 * Re-exports the RBAC middleware for use in the Admin API router.
 *
 * The actual implementation lives in enterprise/rbac/middleware.ts.
 */
export {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireRole,
  requireDepartment,
  requirePolicy,
  requireToolAccess,
  requireDataAccess,
} from "../../rbac/middleware.js";
