export interface IConfigStore {
  getConfig(tenantId: string, agentId: string): Promise<Record<string, unknown> | null>;
  setConfig(
    tenantId: string,
    agentId: string,
    config: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<void>;
  patchConfig(
    tenantId: string,
    agentId: string,
    patch: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<void>;
  listConfigs(
    tenantId: string,
  ): Promise<Array<{ agentId: string; version: number; updatedAt: Date }>>;
}
