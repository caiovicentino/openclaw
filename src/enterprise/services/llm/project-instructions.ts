import * as fs from "fs/promises";
import * as path from "path";

const MAX_INSTRUCTIONS_SIZE = 50 * 1024; // 50KB

interface InstructionContext {
  agentName?: string;
  userName?: string;
  date?: string;
  tenantId?: string;
}

export async function loadProjectInstructions(
  workspacePath: string | undefined,
  configInstructions: string | undefined,
  context: InstructionContext,
): Promise<string | undefined> {
  const parts: string[] = [];

  // 1. Check workspace for CLAUDE.md or instructions.md
  if (workspacePath) {
    for (const filename of ["CLAUDE.md", "instructions.md"]) {
      try {
        const filePath = path.join(workspacePath, filename);
        const content = await fs.readFile(filePath, "utf-8");
        if (content.trim()) {
          parts.push(`# Project Instructions (${filename})\n${content.trim()}`);
          break; // Use first found
        }
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  // 2. Add config-based instructions
  if (configInstructions?.trim()) {
    parts.push(configInstructions.trim());
  }

  if (parts.length === 0) return undefined;

  let combined = parts.join("\n\n");

  // 3. Variable interpolation
  combined = combined
    .replace(/\{\{agent_name\}\}/g, context.agentName ?? "Assistant")
    .replace(/\{\{user_name\}\}/g, context.userName ?? "User")
    .replace(/\{\{date\}\}/g, context.date ?? new Date().toISOString().split("T")[0])
    .replace(/\{\{tenant_id\}\}/g, context.tenantId ?? "");

  // 4. Enforce size limit
  if (combined.length > MAX_INSTRUCTIONS_SIZE) {
    combined = combined.slice(0, MAX_INSTRUCTIONS_SIZE) + "\n\n[Instructions truncated at 50KB]";
  }

  return combined;
}
