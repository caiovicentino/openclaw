import { parseAgentSessionKey, type ParsedAgentSessionKey } from "../sessions/session-key-utils.js";

export {
  isAcpSessionKey,
  isSubagentSessionKey,
  parseAgentSessionKey,
  type ParsedAgentSessionKey,
} from "../sessions/session-key-utils.js";

export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_MAIN_KEY = "main";
export const DEFAULT_ACCOUNT_ID = "default";

// ---------------------------------------------------------------------------
// Enterprise tenant-scoped session keys
// Format: tenant:{tenantId}:agent:{agentId}:user:{userId}:{rest}
// When no tenantId is provided the key is returned unchanged (backward compat).
// ---------------------------------------------------------------------------

export type TenantKeyParams = {
  tenantId?: string | null;
  userId?: string | null;
};

export type ParsedTenantSessionKey = {
  tenantId: string;
  userId: string | null;
  innerKey: string;
};

/**
 * Wrap a plain session key with tenant / user segments.
 * Returns the key unchanged when `tenantId` is falsy.
 */
export function withTenantPrefix(key: string, tenant?: TenantKeyParams): string {
  const tenantId = (tenant?.tenantId ?? "").trim();
  if (!tenantId) return key;
  const userId = (tenant?.userId ?? "").trim();
  if (userId) {
    return `tenant:${tenantId}:user:${userId}:${key}`;
  }
  return `tenant:${tenantId}:${key}`;
}

/**
 * Strip the tenant prefix from a session key and return the parsed parts.
 * Returns `null` when the key does not contain a tenant prefix.
 */
export function parseTenantSessionKey(
  sessionKey: string | undefined | null,
): ParsedTenantSessionKey | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw.startsWith("tenant:")) return null;

  const parts = raw.split(":");
  // Minimum: tenant:{id}:{innerKey...}
  if (parts.length < 3) return null;

  const tenantId = parts[1];
  if (!tenantId) return null;

  // Check for optional user segment: tenant:{id}:user:{uid}:{rest}
  if (parts[2] === "user" && parts.length >= 5) {
    const userId = parts[3];
    const innerKey = parts.slice(4).join(":");
    return { tenantId, userId: userId || null, innerKey };
  }

  const innerKey = parts.slice(2).join(":");
  return { tenantId, userId: null, innerKey };
}

/**
 * Strip the tenant prefix from a session key, returning just the inner key.
 * If no tenant prefix exists the key is returned as-is.
 */
export function stripTenantPrefix(sessionKey: string): string {
  const parsed = parseTenantSessionKey(sessionKey);
  return parsed ? parsed.innerKey : sessionKey;
}

/**
 * Build a tenant-prefixed session key from explicit parts.
 * Produces: tenant:{tenantId}:user:{userId}:{baseKey}
 */
export function buildTenantSessionKey(tenantId: string, userId: string, baseKey: string): string {
  return `tenant:${tenantId}:user:${userId}:${baseKey}`;
}

/**
 * Check whether a key uses the tenant-prefixed format.
 */
export function isTenantSessionKey(key: string): boolean {
  return key.startsWith("tenant:");
}

// Pre-compiled regex
const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

function normalizeToken(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeMainKey(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : DEFAULT_MAIN_KEY;
}

export function toAgentRequestSessionKey(storeKey: string | undefined | null): string | undefined {
  const raw = (storeKey ?? "").trim();
  if (!raw) {
    return undefined;
  }
  // Strip tenant prefix before extracting the request-level key
  const inner = raw.startsWith("tenant:") ? stripTenantPrefix(raw) : raw;
  return parseAgentSessionKey(inner)?.rest ?? inner;
}

export function toAgentStoreSessionKey(params: {
  agentId: string;
  requestKey: string | undefined | null;
  mainKey?: string | undefined;
  tenant?: TenantKeyParams;
}): string {
  const raw = (params.requestKey ?? "").trim();
  if (!raw || raw === DEFAULT_MAIN_KEY) {
    return buildAgentMainSessionKey({
      agentId: params.agentId,
      mainKey: params.mainKey,
      tenant: params.tenant,
    });
  }
  const lowered = raw.toLowerCase();
  let key: string;
  if (lowered.startsWith("agent:")) {
    key = lowered;
  } else if (lowered.startsWith("subagent:")) {
    key = `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
  } else {
    key = `agent:${normalizeAgentId(params.agentId)}:${lowered}`;
  }
  return withTenantPrefix(key, params.tenant);
}

export function resolveAgentIdFromSessionKey(sessionKey: string | undefined | null): string {
  // Strip tenant prefix before parsing the agent segment
  const raw = (sessionKey ?? "").trim();
  const inner = raw.startsWith("tenant:") ? stripTenantPrefix(raw) : raw;
  const parsed = parseAgentSessionKey(inner);
  return normalizeAgentId(parsed?.agentId ?? DEFAULT_AGENT_ID);
}

export function normalizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  // Keep it path-safe + shell-friendly.
  if (VALID_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // Best-effort fallback: collapse invalid characters to "-"
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function sanitizeAgentId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_AGENT_ID;
  }
  if (VALID_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_AGENT_ID
  );
}

export function normalizeAccountId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return DEFAULT_ACCOUNT_ID;
  }
  if (VALID_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return (
    trimmed
      .toLowerCase()
      .replace(INVALID_CHARS_RE, "-")
      .replace(LEADING_DASH_RE, "")
      .replace(TRAILING_DASH_RE, "")
      .slice(0, 64) || DEFAULT_ACCOUNT_ID
  );
}

export function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
  tenant?: TenantKeyParams;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.mainKey);
  const key = `agent:${agentId}:${mainKey}`;
  return withTenantPrefix(key, params.tenant);
}

export function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string | undefined;
  channel: string;
  accountId?: string | null;
  peerKind?: "dm" | "group" | "channel" | null;
  peerId?: string | null;
  identityLinks?: Record<string, string[]>;
  /** DM session scope. */
  dmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
  tenant?: TenantKeyParams;
}): string {
  const peerKind = params.peerKind ?? "dm";
  if (peerKind === "dm") {
    const dmScope = params.dmScope ?? "main";
    let peerId = (params.peerId ?? "").trim();
    const linkedPeerId =
      dmScope === "main"
        ? null
        : resolveLinkedPeerId({
            identityLinks: params.identityLinks,
            channel: params.channel,
            peerId,
          });
    if (linkedPeerId) {
      peerId = linkedPeerId;
    }
    peerId = peerId.toLowerCase();
    if (dmScope === "per-account-channel-peer" && peerId) {
      const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
      const accountId = normalizeAccountId(params.accountId);
      const key = `agent:${normalizeAgentId(params.agentId)}:${channel}:${accountId}:dm:${peerId}`;
      return withTenantPrefix(key, params.tenant);
    }
    if (dmScope === "per-channel-peer" && peerId) {
      const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
      const key = `agent:${normalizeAgentId(params.agentId)}:${channel}:dm:${peerId}`;
      return withTenantPrefix(key, params.tenant);
    }
    if (dmScope === "per-peer" && peerId) {
      const key = `agent:${normalizeAgentId(params.agentId)}:dm:${peerId}`;
      return withTenantPrefix(key, params.tenant);
    }
    return buildAgentMainSessionKey({
      agentId: params.agentId,
      mainKey: params.mainKey,
      tenant: params.tenant,
    });
  }
  const channel = (params.channel ?? "").trim().toLowerCase() || "unknown";
  const peerId = ((params.peerId ?? "").trim() || "unknown").toLowerCase();
  const key = `agent:${normalizeAgentId(params.agentId)}:${channel}:${peerKind}:${peerId}`;
  return withTenantPrefix(key, params.tenant);
}

function resolveLinkedPeerId(params: {
  identityLinks?: Record<string, string[]>;
  channel: string;
  peerId: string;
}): string | null {
  const identityLinks = params.identityLinks;
  if (!identityLinks) {
    return null;
  }
  const peerId = params.peerId.trim();
  if (!peerId) {
    return null;
  }
  const candidates = new Set<string>();
  const rawCandidate = normalizeToken(peerId);
  if (rawCandidate) {
    candidates.add(rawCandidate);
  }
  const channel = normalizeToken(params.channel);
  if (channel) {
    const scopedCandidate = normalizeToken(`${channel}:${peerId}`);
    if (scopedCandidate) {
      candidates.add(scopedCandidate);
    }
  }
  if (candidates.size === 0) {
    return null;
  }
  for (const [canonical, ids] of Object.entries(identityLinks)) {
    const canonicalName = canonical.trim();
    if (!canonicalName) {
      continue;
    }
    if (!Array.isArray(ids)) {
      continue;
    }
    for (const id of ids) {
      const normalized = normalizeToken(id);
      if (normalized && candidates.has(normalized)) {
        return canonicalName;
      }
    }
  }
  return null;
}

export function buildGroupHistoryKey(params: {
  channel: string;
  accountId?: string | null;
  peerKind: "group" | "channel";
  peerId: string;
  tenant?: TenantKeyParams;
}): string {
  const channel = normalizeToken(params.channel) || "unknown";
  const accountId = normalizeAccountId(params.accountId);
  const peerId = params.peerId.trim().toLowerCase() || "unknown";
  const key = `${channel}:${accountId}:${params.peerKind}:${peerId}`;
  return withTenantPrefix(key, params.tenant);
}

export function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
  useSuffix?: boolean;
}): { sessionKey: string; parentSessionKey?: string } {
  const threadId = (params.threadId ?? "").trim();
  if (!threadId) {
    return { sessionKey: params.baseSessionKey, parentSessionKey: undefined };
  }
  const normalizedThreadId = threadId.toLowerCase();
  const useSuffix = params.useSuffix ?? true;
  const sessionKey = useSuffix
    ? `${params.baseSessionKey}:thread:${normalizedThreadId}`
    : params.baseSessionKey;
  return { sessionKey, parentSessionKey: params.parentSessionKey };
}
