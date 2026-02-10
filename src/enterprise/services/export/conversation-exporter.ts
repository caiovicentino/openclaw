import { getTranscript } from "../../db/repositories/session-repo.js";

interface ExportOptions {
  includeToolOutputs?: boolean;
  includeTimestamps?: boolean;
}

export async function exportAsMarkdown(
  tenantId: string,
  sessionId: string,
  title: string,
  options: ExportOptions = {},
): Promise<string> {
  const entries = await getTranscript(tenantId, sessionId, { limit: 1000 });
  const lines: string[] = [`# ${title}`, ""];

  for (const entry of entries) {
    if (entry.role === "user") {
      lines.push(`> **User**: ${entry.content ?? ""}`);
      lines.push("");
    } else if (entry.role === "assistant") {
      lines.push(`**Assistant**: ${entry.content ?? ""}`);
      lines.push("");
    } else if (options.includeToolOutputs && entry.entryType === "tool_use") {
      lines.push(`*Tool: ${entry.content ?? ""}*`);
      lines.push("");
    }
    if (options.includeTimestamps && entry.createdAt) {
      lines.push(`*${new Date(entry.createdAt).toISOString()}*`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export async function exportAsJSON(
  tenantId: string,
  sessionId: string,
  title: string,
  options: ExportOptions = {},
): Promise<string> {
  const entries = await getTranscript(tenantId, sessionId, { limit: 1000 });

  const messages = entries
    .filter((e) => {
      if (e.role === "user" || e.role === "assistant") return true;
      if (options.includeToolOutputs && e.entryType === "tool_use") return true;
      return false;
    })
    .map((e) => ({
      role: e.role,
      content: e.content ?? "",
      timestamp: e.createdAt,
    }));

  return JSON.stringify({ title, exportedAt: new Date().toISOString(), messages }, null, 2);
}
