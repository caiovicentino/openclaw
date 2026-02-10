/**
 * Enterprise Admin API - barrel export.
 *
 * Usage:
 *   import { createEnterpriseApi } from './enterprise/api/index.js';
 *   const app = createEnterpriseApi();
 */

export { createEnterpriseApi } from "./router.js";

// Middleware re-exports
export {
  jwtAuthMiddleware,
  optionalJwtMiddleware,
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requirePolicy,
  requireRole,
  requireDepartment,
  requireToolAccess,
  requireDataAccess,
  auditRoute,
  requestAuditMiddleware,
  authFailureAuditMiddleware,
  requireActiveTenant,
  rateLimit,
} from "./middleware/index.js";
