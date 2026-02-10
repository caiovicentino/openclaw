import fs from "node:fs/promises";
import path from "node:path";
import type { ITranscriptStore, TranscriptStoreEntry } from "./transcript-store.js";

/**
 * File-based ITranscriptStore implementation for single-tenant / standalone mode.
 *
 * Stores transcript entries as newline-delimited JSON (JSONL):
 *   {stateDir}/agents/{agentId}/sessions/{sessionKey}.jsonl
 *
 * Each line is a self-contained JSON object representing one transcript entry.
 * Appends are atomic per-line. The tenantId parameter is accepted but ignored.
 */
export class FileTranscriptStore implements ITranscriptStore {
  constructor(private readonly stateDir: string) {}

  private transcriptDir(agentId: string): string {
    return path.join(this.stateDir, "agents", agentId, "sessions");
  }

  private transcriptPath(agentId: string, sessionKey: string): string {
    return path.join(this.transcriptDir(agentId), `${sessionKey}.jsonl`);
  }

  /** Extract agentId from a sessionKey with format "agentId:rest" or fall back to "_default". */
  private resolveAgentId(sessionKey: string): string {
    const sep = sessionKey.indexOf(":");
    return sep > 0 ? sessionKey.slice(0, sep) : "_default";
  }

  async append(_tenantId: string, sessionKey: string, entry: TranscriptStoreEntry): Promise<void> {
    const agentId = this.resolveAgentId(sessionKey);
    const filePath = this.transcriptPath(agentId, sessionKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const line = JSON.stringify({ ...entry, createdAt: entry.createdAt ?? new Date() }) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  }

  async getTranscript(
    _tenantId: string,
    sessionKey: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<TranscriptStoreEntry[]> {
    const agentId = this.resolveAgentId(sessionKey);
    const filePath = this.transcriptPath(agentId, sessionKey);

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const entries: TranscriptStoreEntry[] = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TranscriptStoreEntry);

    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async deleteTranscript(_tenantId: string, sessionKey: string): Promise<void> {
    const agentId = this.resolveAgentId(sessionKey);
    const filePath = this.transcriptPath(agentId, sessionKey);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }
  }

  async deleteOlderThan(_tenantId: string, beforeDate: Date): Promise<number> {
    const cutoff = beforeDate.getTime();
    let totalDeleted = 0;

    const agentsDir = path.join(this.stateDir, "agents");
    let agentDirs: string[];
    try {
      const entries = await fs.readdir(agentsDir, { withFileTypes: true });
      agentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return 0;
    }

    for (const agentId of agentDirs) {
      const sessionsDir = this.transcriptDir(agentId);
      let files: string[];
      try {
        const entries = await fs.readdir(sessionsDir);
        files = entries.filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = path.join(sessionsDir, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs < cutoff) {
            await fs.unlink(filePath);
            totalDeleted++;
          }
        } catch {
          // ignore errors on individual files
        }
      }
    }

    return totalDeleted;
  }
}
