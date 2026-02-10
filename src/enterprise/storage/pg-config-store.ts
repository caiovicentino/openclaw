import type { IConfigStore } from "./config-store.js";
import { query } from "../db/connection.js";

export class PgConfigStore implements IConfigStore {
  async getConfig(tenantId: string, agentId: string): Promise<Record<string, unknown> | null> {
    const result = await query(
      `SELECT config FROM agent_configs
       WHERE tenant_id = $1 AND agent_id = $2`,
      [tenantId, agentId],
    );

    if (result.rows.length === 0) return null;
    return result.rows[0].config as Record<string, unknown>;
  }

  async setConfig(
    tenantId: string,
    agentId: string,
    config: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<void> {
    await query(
      `INSERT INTO agent_configs (tenant_id, agent_id, config, version, updated_by)
       VALUES ($1, $2, $3::jsonb, 1, $4)
       ON CONFLICT (tenant_id, agent_id)
       DO UPDATE SET
         config = $3::jsonb,
         version = agent_configs.version + 1,
         updated_at = NOW(),
         updated_by = COALESCE($4, agent_configs.updated_by)`,
      [tenantId, agentId, JSON.stringify(config), updatedBy ?? null],
    );
  }

  async patchConfig(
    tenantId: string,
    agentId: string,
    patch: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<void> {
    // Use jsonb concatenation to merge the patch into the existing config.
    // If no row exists yet, create one with the patch as the initial config.
    await query(
      `INSERT INTO agent_configs (tenant_id, agent_id, config, version, updated_by)
       VALUES ($1, $2, $3::jsonb, 1, $4)
       ON CONFLICT (tenant_id, agent_id)
       DO UPDATE SET
         config = agent_configs.config || $3::jsonb,
         version = agent_configs.version + 1,
         updated_at = NOW(),
         updated_by = COALESCE($4, agent_configs.updated_by)`,
      [tenantId, agentId, JSON.stringify(patch), updatedBy ?? null],
    );
  }

  async listConfigs(
    tenantId: string,
  ): Promise<Array<{ agentId: string; version: number; updatedAt: Date }>> {
    const result = await query(
      `SELECT agent_id, version, updated_at
       FROM agent_configs
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId],
    );

    return result.rows.map((row) => ({
      agentId: row.agent_id as string,
      version: row.version as number,
      updatedAt: new Date(row.updated_at as string),
    }));
  }
}
