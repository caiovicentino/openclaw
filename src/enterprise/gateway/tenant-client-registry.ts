// Manages WebSocket clients organized by tenant for data isolation

export type TenantWsClient = {
  connId: string;
  tenantId: string;
  userId: string;
  permissions: string[];
  ws: unknown; // WebSocket instance (generic to avoid coupling)
};

export class TenantClientRegistry {
  private clientsByTenant = new Map<string, Set<TenantWsClient>>();
  private clientsByConnId = new Map<string, TenantWsClient>();

  register(client: TenantWsClient): void {
    this.clientsByConnId.set(client.connId, client);

    let tenantSet = this.clientsByTenant.get(client.tenantId);
    if (!tenantSet) {
      tenantSet = new Set<TenantWsClient>();
      this.clientsByTenant.set(client.tenantId, tenantSet);
    }
    tenantSet.add(client);
  }

  unregister(connId: string): void {
    const client = this.clientsByConnId.get(connId);
    if (!client) return;

    this.clientsByConnId.delete(connId);

    const tenantSet = this.clientsByTenant.get(client.tenantId);
    if (tenantSet) {
      tenantSet.delete(client);
      if (tenantSet.size === 0) {
        this.clientsByTenant.delete(client.tenantId);
      }
    }
  }

  getClientsByTenant(tenantId: string): Set<TenantWsClient> {
    return this.clientsByTenant.get(tenantId) ?? new Set();
  }

  getClient(connId: string): TenantWsClient | undefined {
    return this.clientsByConnId.get(connId);
  }

  getTenantForClient(connId: string): string | undefined {
    return this.clientsByConnId.get(connId)?.tenantId;
  }

  getClientCount(tenantId?: string): number {
    if (tenantId !== undefined) {
      return this.clientsByTenant.get(tenantId)?.size ?? 0;
    }
    return this.clientsByConnId.size;
  }

  getAllTenantIds(): string[] {
    return Array.from(this.clientsByTenant.keys());
  }

  clear(): void {
    this.clientsByTenant.clear();
    this.clientsByConnId.clear();
  }
}
