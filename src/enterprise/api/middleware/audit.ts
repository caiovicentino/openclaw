/**
 * Re-exports the audit middleware for use in the Admin API router.
 *
 * The actual implementation lives in enterprise/audit/audit-middleware.ts.
 */
export {
  auditRoute,
  requestAuditMiddleware,
  authFailureAuditMiddleware,
} from "../../audit/audit-middleware.js";
