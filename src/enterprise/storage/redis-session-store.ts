import type { ISessionStore, SessionStoreEntry } from "./session-store.js";
import { getRedisClient } from "./redis-connection.js";

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function keyPrefix(tenantId: string, agentId: string): string {
  return `cerebro:sessions:${tenantId}:${agentId}`;
}

function hashKey(tenantId: string, agentId: string, sessionKey: string): string {
  return `${keyPrefix(tenantId, agentId)}:entry:${sessionKey}`;
}

function indexKey(tenantId: string, agentId: string): string {
  return `${keyPrefix(tenantId, agentId)}:index`;
}

function userIndexKey(tenantId: string, agentId: string, userId: string): string {
  return `${keyPrefix(tenantId, agentId)}:user:${userId}`;
}

function serialize(entry: SessionStoreEntry): Record<string, string> {
  return {
    sessionKey: entry.sessionKey,
    sessionData: JSON.stringify(entry.sessionData),
    userId: entry.userId ?? "",
    status: entry.status ?? "",
    createdAt: entry.createdAt ? entry.createdAt.toISOString() : "",
    updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : "",
  };
}

function deserialize(data: Record<string, string>): SessionStoreEntry {
  return {
    sessionKey: data.sessionKey,
    sessionData: data.sessionData ? (JSON.parse(data.sessionData) as Record<string, unknown>) : {},
    userId: data.userId || undefined,
    status: data.status || undefined,
    createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
  };
}

export class RedisSessionStore implements ISessionStore {
  private readonly ttl: number;

  constructor(ttlSeconds: number = DEFAULT_TTL_SECONDS) {
    this.ttl = ttlSeconds;
  }

  async get(
    tenantId: string,
    agentId: string,
    sessionKey: string,
  ): Promise<SessionStoreEntry | null> {
    const redis = getRedisClient();
    const data = await redis.hgetall(hashKey(tenantId, agentId, sessionKey));
    if (!data || !data.sessionKey) return null;
    return deserialize(data);
  }

  async set(
    tenantId: string,
    agentId: string,
    sessionKey: string,
    data: SessionStoreEntry,
  ): Promise<void> {
    const redis = getRedisClient();
    const now = new Date();
    const entry: SessionStoreEntry = {
      ...data,
      sessionKey,
      updatedAt: now,
      createdAt: data.createdAt ?? now,
    };

    const hk = hashKey(tenantId, agentId, sessionKey);
    const ik = indexKey(tenantId, agentId);
    const score = now.getTime();

    const pipeline = redis.pipeline();
    pipeline.hset(hk, serialize(entry));
    pipeline.expire(hk, this.ttl);
    // Sorted set for listing, scored by updatedAt timestamp
    pipeline.zadd(ik, String(score), sessionKey);

    // User index for filtering by userId
    if (entry.userId) {
      const uik = userIndexKey(tenantId, agentId, entry.userId);
      pipeline.sadd(uik, sessionKey);
      pipeline.expire(uik, this.ttl);
    }

    await pipeline.exec();
  }

  async list(
    tenantId: string,
    agentId: string,
    filters?: { userId?: string; limit?: number; offset?: number },
  ): Promise<SessionStoreEntry[]> {
    const redis = getRedisClient();
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    let sessionKeys: string[];

    if (filters?.userId) {
      // Get session keys for this user, then intersect with the sorted index
      const uik = userIndexKey(tenantId, agentId, filters.userId);
      const userKeys = await redis.smembers(uik);
      if (userKeys.length === 0) return [];

      // Get scores for ordering, then sort descending and paginate
      const ik = indexKey(tenantId, agentId);
      const scored: Array<{ key: string; score: number }> = [];
      for (const k of userKeys) {
        const s = await redis.zscore(ik, k);
        if (s !== null) scored.push({ key: k, score: Number(s) });
      }
      scored.sort((a, b) => b.score - a.score);
      sessionKeys = scored.slice(offset, offset + limit).map((s) => s.key);
    } else {
      // Descending order (most recent first) with pagination
      const ik = indexKey(tenantId, agentId);
      sessionKeys = await redis.zrevrange(ik, offset, offset + limit - 1);
    }

    if (sessionKeys.length === 0) return [];

    const entries: SessionStoreEntry[] = [];
    for (const sk of sessionKeys) {
      const data = await redis.hgetall(hashKey(tenantId, agentId, sk));
      if (data && data.sessionKey) {
        entries.push(deserialize(data));
      }
    }
    return entries;
  }

  async delete(tenantId: string, agentId: string, sessionKey: string): Promise<void> {
    const redis = getRedisClient();
    const hk = hashKey(tenantId, agentId, sessionKey);

    // Read entry to get userId before deleting
    const data = await redis.hgetall(hk);
    const pipeline = redis.pipeline();

    pipeline.del(hk);
    pipeline.zrem(indexKey(tenantId, agentId), sessionKey);

    if (data?.userId) {
      pipeline.srem(userIndexKey(tenantId, agentId, data.userId), sessionKey);
    }

    await pipeline.exec();
  }

  async deleteExpired(tenantId: string, beforeDate: Date): Promise<number> {
    const redis = getRedisClient();
    const cutoff = beforeDate.getTime();

    // Scan for all index keys belonging to this tenant
    const pattern = `cerebro:sessions:${tenantId}:*:index`;
    const indexKeys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      indexKeys.push(...keys);
    } while (cursor !== "0");

    let totalDeleted = 0;

    for (const ik of indexKeys) {
      // Get all entries scored before cutoff
      const expired = await redis.zrangebyscore(ik, "-inf", String(cutoff));
      if (expired.length === 0) continue;

      // Derive agentId from the index key
      // key format: cerebro:sessions:{tenantId}:{agentId}:index
      const parts = ik.split(":");
      const agentId = parts[3];

      const pipeline = redis.pipeline();
      for (const sk of expired) {
        const hk = hashKey(tenantId, agentId, sk);
        pipeline.del(hk);
        pipeline.zrem(ik, sk);
      }
      await pipeline.exec();
      totalDeleted += expired.length;
    }

    return totalDeleted;
  }
}
