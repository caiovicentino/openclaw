/**
 * Re-exports the JWT authentication middleware for use in the Admin API router.
 *
 * The actual implementation lives in enterprise/auth/jwt-middleware.ts.
 * This module provides a single convenient import point for API routes.
 */
export { jwtAuthMiddleware, optionalJwtMiddleware } from "../../auth/jwt-middleware.js";
