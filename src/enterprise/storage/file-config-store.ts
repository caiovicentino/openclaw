import JSON5 from "json5";
import fs from "node:fs/promises";
import path from "node:path";
import type { IConfigStore } from "./config-store.js";

/**
 * File-based IConfigStore implementation for single-tenant / standalone mode.
 *
 * Stores agent configs as individual JSON files under a config directory:
 *   {configDir}/{agentId}.json
 *
 * Uses atomic writes (write to .tmp then rename) to prevent corruption.
 * Reads support JSON5 for human-editable configs; writes produce standard JSON.
 * The tenantId parameter is accepted but ignored (single-tenant).
 */
export class FileConfigStore implements IConfigStore {
  constructor(private readonly configDir: string) {}

  private configPath(agentId: string): string {
    return path.join(this.configDir, `${agentId}.json`);
  }

  async getConfig(_tenantId: string, agentId: string): Promise<Record<string, unknown> | null> {
    const filePath = this.configPath(agentId);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON5.parse(raw) as Record<string, unknown>;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async setConfig(
    _tenantId: string,
    agentId: string,
    config: Record<string, unknown>,
    _updatedBy?: string,
  ): Promise<void> {
    const filePath = this.configPath(agentId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(config, null, 2), "utf-8");
    await fs.rename(tmp, filePath);
  }

  async patchConfig(
    _tenantId: string,
    agentId: string,
    patch: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<void> {
    const existing = (await this.getConfig("", agentId)) ?? {};
    const merged = { ...existing, ...patch };
    await this.setConfig("", agentId, merged, updatedBy);
  }

  async listConfigs(
    _tenantId: string,
  ): Promise<Array<{ agentId: string; version: number; updatedAt: Date }>> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(this.configDir, { withFileTypes: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const results: Array<{ agentId: string; version: number; updatedAt: Date }> = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const agentId = entry.name.replace(/\.json$/, "");
      const filePath = path.join(this.configDir, entry.name);
      try {
        const stat = await fs.stat(filePath);
        results.push({
          agentId,
          version: 1, // file-based store does not track versions
          updatedAt: stat.mtime,
        });
      } catch {
        // skip files we can't stat
      }
    }

    return results;
  }
}
