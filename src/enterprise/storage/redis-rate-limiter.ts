import type { MiddlewareHandler } from "hono";
import { getRedisClient } from "./redis-connection.js";

type RedisRateLimitOptions = {
  /** Maximum requests allowed in the window. Default: 100. */
  max?: number;
  /** Window size in milliseconds. Default: 60_000 (1 minute). */
  windowMs?: number;
  /** Key extractor. Defaults to IP + tenant ID. */
  keyFn?: (c: Parameters<MiddlewareHandler>[0]) => string;
};

/**
 * Redis-backed sliding-window rate limiter using MULTI/EXEC.
 *
 * Suitable for multi-process / multi-node deployments.
 * Drop-in replacement for the in-memory `rateLimit()` middleware.
 *
 * @example
 * ```ts
 * app.use("/api/*", createRedisRateLimit({ max: 60, windowMs: 60_000 }));
 * ```
 */
export function createRedisRateLimit(opts?: RedisRateLimitOptions): MiddlewareHandler {
  const max = opts?.max ?? 100;
  const windowMs = opts?.windowMs ?? 60_000;

  return async (c, next) => {
    const key =
      opts?.keyFn?.(c) ??
      `${c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown"}:${
        (c.get("tenantContext") as { tenantId?: string } | undefined)?.tenantId ?? "_"
      }`;

    const redis = getRedisClient();
    const bucketKey = `cerebro:ratelimit:${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Sliding window: each request is a member scored by its timestamp.
    // Remove expired entries, count remaining, and add current if under limit.
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(bucketKey, "-inf", String(windowStart));
    pipeline.zcard(bucketKey);
    pipeline.zadd(bucketKey, String(now), `${now}:${Math.random().toString(36).slice(2, 8)}`);
    pipeline.pexpire(bucketKey, windowMs);

    const results = await pipeline.exec();

    // results[1] = [err, count] from zcard
    const currentCount = (results?.[1]?.[1] as number) ?? 0;
    const remaining = Math.max(0, max - currentCount - 1);

    if (currentCount >= max) {
      // Over limit – remove the member we just added
      const addResult = results?.[2];
      if (addResult) {
        // The member was already added; we need to remove the last one
        await redis.zremrangebyrank(bucketKey, -1, -1);
      }

      const retryAfter = Math.ceil(windowMs / 1000);
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", "0");
      return c.json({ error: "Too Many Requests", message: "Rate limit exceeded" }, 429);
    }

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));

    await next();
  };
}
