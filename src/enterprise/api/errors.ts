import type { Context } from "hono";

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

function getRequestId(c: Context): string | undefined {
  try {
    const ctx = c.get("tenantContext");
    return ctx?.requestId;
  } catch {
    return undefined;
  }
}

function errorResponse(
  c: Context,
  status: number,
  error: string,
  message: string,
  details?: unknown,
) {
  const body: ApiError = { error, message };
  if (details !== undefined) body.details = details;
  const requestId = getRequestId(c);
  if (requestId) body.requestId = requestId;
  return c.json(body, status as any);
}

export function badRequest(c: Context, message: string, details?: unknown) {
  return errorResponse(c, 400, "BAD_REQUEST", message, details);
}

export function unauthorized(c: Context, message = "Authentication required") {
  return errorResponse(c, 401, "UNAUTHORIZED", message);
}

export function forbidden(c: Context, message = "Insufficient permissions") {
  return errorResponse(c, 403, "FORBIDDEN", message);
}

export function notFound(c: Context, resource = "Resource") {
  return errorResponse(c, 404, "NOT_FOUND", `${resource} not found`);
}

export function conflict(c: Context, message: string) {
  return errorResponse(c, 409, "CONFLICT", message);
}

export function tooManyRequests(c: Context, retryAfter: number) {
  c.header("Retry-After", String(retryAfter));
  return errorResponse(c, 429, "TOO_MANY_REQUESTS", "Too many requests. Please try again later.");
}

export function internalError(c: Context, message = "Internal server error") {
  return errorResponse(c, 500, "INTERNAL_ERROR", message);
}
