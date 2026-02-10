// Tenant-isolated broadcast for WebSocket events

import { TenantClientRegistry, TenantWsClient } from "./tenant-client-registry";

export type BroadcastOptions = {
  tenantId: string;
  excludeConnIds?: string[];
  filterByPermission?: string;
  filterByUserId?: string;
};

type WsLike = { send(data: string): void };

function trySend(client: TenantWsClient, event: string, data: unknown): boolean {
  try {
    const ws = client.ws as WsLike;
    ws.send(JSON.stringify({ event, data }));
    return true;
  } catch {
    return false;
  }
}

export class TenantBroadcast {
  constructor(private registry: TenantClientRegistry) {}

  broadcast(options: BroadcastOptions, event: string, data: unknown): number {
    const clients = this.registry.getClientsByTenant(options.tenantId);
    const excludeSet = options.excludeConnIds ? new Set(options.excludeConnIds) : undefined;

    let count = 0;
    for (const client of clients) {
      if (excludeSet?.has(client.connId)) continue;
      if (options.filterByPermission && !client.permissions.includes(options.filterByPermission))
        continue;
      if (options.filterByUserId && client.userId !== options.filterByUserId) continue;

      if (trySend(client, event, data)) {
        count++;
      }
    }
    return count;
  }

  broadcastToUser(tenantId: string, userId: string, event: string, data: unknown): number {
    return this.broadcast({ tenantId, filterByUserId: userId }, event, data);
  }

  broadcastToPermission(
    tenantId: string,
    permission: string,
    event: string,
    data: unknown,
  ): number {
    return this.broadcast({ tenantId, filterByPermission: permission }, event, data);
  }

  unicast(connId: string, event: string, data: unknown): boolean {
    const client = this.registry.getClient(connId);
    if (!client) return false;
    return trySend(client, event, data);
  }
}
