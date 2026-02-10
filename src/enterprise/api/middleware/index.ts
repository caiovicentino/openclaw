/**
 * Enterprise API middleware barrel exports.
 *
 * Re-exports the auth, RBAC, and audit middleware so that route files
 * can import from a single location.
 */

// Auth
export { jwtAuthMiddleware, optionalJwtMiddleware } from "../../auth/jwt-middleware.js";

// RBAC
export {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requirePolicy,
  requireRole,
  requireDepartment,
  requireToolAccess,
  requireDataAccess,
} from "../../rbac/middleware.js";

// Audit
export {
  auditRoute,
  requestAuditMiddleware,
  authFailureAuditMiddleware,
} from "../../audit/audit-middleware.js";

// Tenant
export { requireActiveTenant } from "./tenant.js";

// Rate limiting
export { rateLimit } from "./rate-limit.js";
export { createRateLimit, keyGenerators } from "./rate-limit-factory.js";
