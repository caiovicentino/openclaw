import { randomBytes, createHash } from "crypto";

export type ApiKey = {
  id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  createdBy: string;
};

// In-memory store for API keys (replace with persistent store in production)
const apiKeyStore = new Map<string, ApiKey>();

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(tenantId: string): { key: string; prefix: string; keyHash: string } {
  const randomPart = randomBytes(32).toString("base64url").slice(0, 32);
  const prefix = "oc_live_";
  const key = `${prefix}${randomPart}`;
  const keyHash = hashApiKey(key);

  return { key, prefix, keyHash };
}

export function storeApiKey(apiKey: ApiKey): void {
  apiKeyStore.set(apiKey.keyHash, apiKey);
}

export async function verifyApiKey(
  key: string,
): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
  const keyHash = hashApiKey(key);
  const stored = apiKeyStore.get(keyHash);

  if (!stored) {
    return { valid: false };
  }

  if (stored.expiresAt && stored.expiresAt < new Date()) {
    return { valid: false };
  }

  stored.lastUsedAt = new Date();

  return {
    valid: true,
    tenantId: stored.tenantId,
    scopes: stored.scopes,
  };
}
