import type { IncomingMessage } from "node:http";
import { createTenantContext, type TenantContext } from "../context/tenant-context.js";
import { verifyStackAuthToken } from "./stack-auth.js";
import { resolveStackAuthUser } from "./user-bridge.js";

export type WsAuthResult = {
  ok: boolean;
  tenantContext?: TenantContext;
  reason?: string;
};

export function extractTokenFromRequest(req: IncomingMessage): string | null {
  // 1. URL query param ?token=...
  const url = req.url;
  if (url) {
    const queryStart = url.indexOf("?");
    if (queryStart !== -1) {
      const params = new URLSearchParams(url.slice(queryStart));
      const token = params.get("token");
      if (token) return token;
    }
  }

  // 2. Sec-WebSocket-Protocol header (used as token transport)
  const wsProtocol = req.headers["sec-websocket-protocol"];
  if (wsProtocol) {
    const protocols = typeof wsProtocol === "string" ? wsProtocol.split(",") : wsProtocol;
    for (const proto of protocols) {
      const trimmed = proto.trim();
      if (trimmed.startsWith("access_token.")) {
        return trimmed.slice("access_token.".length);
      }
    }
  }

  // 3. Authorization header with Bearer scheme
  const auth = req.headers["authorization"];
  if (auth) {
    const match = auth.match(/^Bearer\s+(\S+)$/i);
    if (match) return match[1];
  }

  return null;
}

export async function authenticateWsConnection(req: IncomingMessage): Promise<WsAuthResult> {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return { ok: false, reason: "No authentication token provided" };
  }

  try {
    const stackPayload = await verifyStackAuthToken(token);
    const resolved = await resolveStackAuthUser(stackPayload);

    const forwarded = req.headers["x-forwarded-for"];
    const ipAddress = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined;

    const tenantContext = createTenantContext({
      tenantId: resolved.tenantId,
      tenantSlug: resolved.tenantSlug,
      userId: resolved.userId,
      userEmail: resolved.email,
      userName: resolved.name,
      department: resolved.department,
      roles: resolved.roles,
      permissions: resolved.permissions,
      ipAddress,
    });

    return { ok: true, tenantContext };
  } catch {
    return { ok: false, reason: "Invalid or expired access token" };
  }
}
