import type { Context, MiddlewareHandler } from "hono";
import { rateLimit } from "./rate-limit.js";

/**
 * Options for creating a per-endpoint rate limiter.
 */
export type CreateRateLimitOptions = {
  /** Maximum requests allowed in the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
  /** Custom key generator. Defaults to IP-based. */
  keyGenerator?: (c: Context) => string;
};

/**
 * Pre-built key generators for common rate-limiting strategies.
 */
export const keyGenerators = {
  /** Rate limit by client IP address. */
  byIp: (c: Context): string => {
    const ip =
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      c.req.header("X-Real-Ip") ??
      "unknown";
    return `ip:${ip}`;
  },

  /** Rate limit by authenticated user ID. */
  byUser: (c: Context): string => {
    const ctx = c.get("tenantContext") as { userId?: string; tenantId?: string } | undefined;
    return `user:${ctx?.tenantId ?? "_"}:${ctx?.userId ?? "anon"}`;
  },

  /** Rate limit by tenant ID. */
  byTenant: (c: Context): string => {
    const ctx = c.get("tenantContext") as { tenantId?: string } | undefined;
    return `tenant:${ctx?.tenantId ?? "_"}`;
  },
} as const;

/**
 * Factory that creates a rate-limit middleware for a specific endpoint.
 *
 * Wraps the existing `rateLimit` middleware with a cleaner API and
 * pre-built key generators for IP, user, and tenant strategies.
 *
 * @example
 * ```ts
 * // 5 requests per hour per IP
 * app.post('/forgot-password', createRateLimit({ max: 5, windowMs: 60 * 60 * 1000 }), handler);
 *
 * // 10 requests per hour per user
 * app.post('/mfa/setup', createRateLimit({ max: 10, windowMs: 60 * 60 * 1000, keyGenerator: keyGenerators.byUser }), handler);
 * ```
 */
export function createRateLimit(options: CreateRateLimitOptions): MiddlewareHandler {
  const { max, windowMs, keyGenerator } = options;

  // Prefix the key with the endpoint path to isolate buckets per route
  const keyFn = (c: Context): string => {
    const baseKey = keyGenerator ? keyGenerator(c) : keyGenerators.byIp(c);
    const path = c.req.routePath ?? c.req.path;
    return `rl:${c.req.method}:${path}:${baseKey}`;
  };

  return rateLimit({ max, windowMs, keyFn });
}
