import Redis from "ioredis";

let client: Redis | null = null;

/**
 * Returns a shared Redis client singleton.
 *
 * Configured via environment variables:
 * - `REDIS_URL` – full connection string (takes precedence), or
 * - `REDIS_HOST` (default "127.0.0.1"), `REDIS_PORT` (default 6379),
 *   `REDIS_PASSWORD` (optional).
 */
export function getRedisClient(): Redis {
  if (client) return client;

  const url = process.env.REDIS_URL;

  if (url) {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 5000);
      },
    });
  } else {
    client = new Redis({
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 200, 5000);
      },
    });
  }

  client.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });

  return client;
}

/**
 * Gracefully close the Redis connection (for shutdown hooks).
 */
export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
