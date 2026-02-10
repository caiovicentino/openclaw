import type { MiddlewareHandler } from "hono";

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Suitable for single-process deployments. For multi-node setups,
 * replace with a Redis-backed implementation.
 */
type RateLimitBucket = {
  tokens: number;
  lastRefill: number;
};

const buckets = new Map<string, RateLimitBucket>();

// Periodic cleanup of stale buckets (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > STALE_THRESHOLD_MS) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

type RateLimitOptions = {
  /** Maximum requests allowed in the window. Default: 100. */
  max?: number;
  /** Window size in milliseconds. Default: 60_000 (1 minute). */
  windowMs?: number;
  /** Key extractor. Defaults to IP + tenant ID. */
  keyFn?: (c: Parameters<MiddlewareHandler>[0]) => string;
};

/**
 * Rate-limit middleware using a token-bucket algorithm.
 *
 * @example
 * ```ts
 * app.use("/api/*", rateLimit({ max: 60, windowMs: 60_000 }));
 * ```
 */
export function rateLimit(opts?: RateLimitOptions): MiddlewareHandler {
  const max = opts?.max ?? 100;
  const windowMs = opts?.windowMs ?? 60_000;

  ensureCleanup();

  return async (c, next) => {
    const key =
      opts?.keyFn?.(c) ??
      `${c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown"}:${
        (c.get("tenantContext") as { tenantId?: string } | undefined)?.tenantId ?? "_"
      }`;

    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: max, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / windowMs) * max);
    if (refill > 0) {
      bucket.tokens = Math.min(max, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      const retryAfter = Math.ceil(windowMs / 1000);
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", "0");
      return c.json({ error: "Too Many Requests", message: "Rate limit exceeded" }, 429);
    }

    bucket.tokens--;

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(bucket.tokens));

    await next();
  };
}
