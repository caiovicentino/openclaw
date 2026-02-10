import fs from "node:fs/promises";
import path from "node:path";
import type { ISessionStore, SessionStoreEntry } from "./session-store.js";

/**
 * File-based ISessionStore implementation for single-tenant / standalone mode.
 *
 * Stores all sessions for a given agent in a single JSON file:
 *   {stateDir}/agents/{agentId}/sessions/sessions.json
 *
 * Uses atomic writes (write to .tmp then rename) to prevent corruption.
 * The tenantId parameter is accepted but ignored (single-tenant).
 */
export class FileSessionStore implements ISessionStore {
  constructor(private readonly stateDir: string) {}

  private sessionsPath(agentId: string): string {
    return path.join(this.stateDir, "agents", agentId, "sessions", "sessions.json");
  }

  private async readAll(agentId: string): Promise<Record<string, SessionStoreEntry>> {
    const filePath = this.sessionsPath(agentId);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as Record<string, SessionStoreEntry>;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw err;
    }
  }

  private async writeAll(agentId: string, data: Record<string, SessionStoreEntry>): Promise<void> {
    const filePath = this.sessionsPath(agentId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, filePath);
  }

  async get(
    _tenantId: string,
    agentId: string,
    sessionKey: string,
  ): Promise<SessionStoreEntry | null> {
    const all = await this.readAll(agentId);
    return all[sessionKey] ?? null;
  }

  async set(
    _tenantId: string,
    agentId: string,
    sessionKey: string,
    data: SessionStoreEntry,
  ): Promise<void> {
    const all = await this.readAll(agentId);
    all[sessionKey] = { ...data, sessionKey, updatedAt: new Date() };
    if (!all[sessionKey].createdAt) {
      all[sessionKey].createdAt = new Date();
    }
    await this.writeAll(agentId, all);
  }

  async list(
    _tenantId: string,
    agentId: string,
    filters?: { userId?: string; limit?: number; offset?: number },
  ): Promise<SessionStoreEntry[]> {
    const all = await this.readAll(agentId);
    let entries = Object.values(all);

    if (filters?.userId) {
      entries = entries.filter((e) => e.userId === filters.userId);
    }

    // Sort by updatedAt descending (most recent first)
    entries.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async delete(_tenantId: string, agentId: string, sessionKey: string): Promise<void> {
    const all = await this.readAll(agentId);
    if (!(sessionKey in all)) {
      return;
    }
    delete all[sessionKey];
    await this.writeAll(agentId, all);
  }

  async deleteExpired(_tenantId: string, beforeDate: Date): Promise<number> {
    const cutoff = beforeDate.getTime();
    let totalDeleted = 0;

    // Iterate over all agent directories
    const agentsDir = path.join(this.stateDir, "agents");
    let agentDirs: string[];
    try {
      const entries = await fs.readdir(agentsDir, { withFileTypes: true });
      agentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return 0;
    }

    for (const agentId of agentDirs) {
      const all = await this.readAll(agentId);
      let changed = false;
      for (const [key, entry] of Object.entries(all)) {
        const ts = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
        if (ts > 0 && ts < cutoff) {
          delete all[key];
          totalDeleted++;
          changed = true;
        }
      }
      if (changed) {
        await this.writeAll(agentId, all);
      }
    }

    return totalDeleted;
  }
}
