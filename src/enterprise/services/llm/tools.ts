import { exec, spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import { query } from "../../db/connection.js";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface ToolContext {
  workspacePath?: string;
  agentId?: string;
  tenantId?: string;
  sessionId?: string;
  signal?: AbortSignal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpManager?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hookEngine?: any;
}

// ---------------------------------------------------------------------------
// Tool Definitions (Claude Code canonical casing for OAuth compatibility)
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "Bash",
    description:
      "Execute a shell command and return the output. Use for running scripts, installing packages, git operations, and other terminal tasks.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default 30000, max 120000)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "Read",
    description:
      "Read a file's contents. Returns numbered lines. Use to examine code, configs, or any text file.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to read",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (0-based)",
        },
        limit: {
          type: "number",
          description: "Number of lines to read",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description:
      "Write content to a file, creating it and parent directories if needed. Overwrites existing content.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "Edit",
    description:
      "Edit a file by replacing a specific string with new content. The old_string must match exactly.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to edit",
        },
        old_string: {
          type: "string",
          description: "The exact text to find and replace",
        },
        new_string: {
          type: "string",
          description: "The replacement text",
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "Glob",
    description: "Find files matching a pattern. Returns file paths relative to the workspace.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description:
            'Filename pattern to match (e.g. "*.ts", "*.json"). Supports shell glob syntax.',
        },
        path: {
          type: "string",
          description: "Directory to search in (default: workspace root)",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "Grep",
    description:
      "Search for a regex pattern in files. Returns matching lines with file paths and line numbers.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for",
        },
        path: {
          type: "string",
          description: "File or directory to search in (default: workspace root)",
        },
        include: {
          type: "string",
          description: 'File glob to include (e.g. "*.ts")',
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "WebSearch",
    description:
      "Search the web for information. Returns search result titles, URLs, and snippets.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "WebFetch",
    description:
      "Fetch content from a URL. For HTML pages, returns text content with tags stripped.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch",
        },
        prompt: {
          type: "string",
          description: "What information to extract from the page",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "UpdateMemory",
    description:
      "Update your persistent memory. This memory persists across ALL conversations and is included at the start of every new chat session. Use it to remember important facts, user preferences, project context, lessons learned, and anything that should be recalled in future conversations. Write in concise markdown format.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The full memory content in markdown format. This REPLACES the existing memory.",
        },
        mode: {
          type: "string",
          enum: ["replace", "append"],
          description: 'Whether to replace the entire memory or append to it (default: "replace")',
        },
      },
      required: ["content"],
    },
  },
  {
    name: "HandoffToAgent",
    description:
      "Transfer this conversation to a different agent that is better suited for the user's request. Provide a brief context summary so the new agent understands the conversation history.",
    input_schema: {
      type: "object",
      properties: {
        targetAgentId: {
          type: "string",
          description: "ID of the agent to hand off to",
        },
        contextSummary: {
          type: "string",
          description: "Brief summary of the conversation context for the new agent",
        },
      },
      required: ["targetAgentId", "contextSummary"],
    },
  },
  {
    name: "InvokeAgent",
    description:
      "Ask another agent to complete a specific task and return the result. The sub-agent runs independently and returns its response.",
    input_schema: {
      type: "object",
      properties: {
        targetAgentId: {
          type: "string",
          description: "ID of the agent to invoke",
        },
        task: {
          type: "string",
          description: "The task or question for the sub-agent",
        },
      },
      required: ["targetAgentId", "task"],
    },
  },
  {
    name: "SearchKnowledgeBase",
    description:
      "Search the agent's knowledge base for relevant information. Use this when the user asks about topics that might be covered in uploaded documents.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        limit: {
          type: "number",
          description: "Max results (default 5)",
        },
      },
      required: ["query"],
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getToolDefinitions(mcpTools?: ToolDefinition[]): ToolDefinition[] {
  const defs = [...TOOL_DEFINITIONS];
  if (mcpTools?.length) {
    defs.push(...mcpTools);
  }
  return defs;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const workspace = context.workspacePath ?? "/tmp/cerebro-default-workspace";

  // Run pre_tool hooks
  if (context.hookEngine) {
    const { HookEngine } = await import("../hooks/engine.js");
    const engine = context.hookEngine as InstanceType<typeof HookEngine>;
    const hookCtx = {
      tenantId: context.tenantId ?? "",
      agentId: context.agentId ?? "",
      sessionId: context.sessionId,
      toolName: name,
      toolInput: input,
    };
    const preResults = await engine.runHooks("pre_tool", hookCtx);
    const blocked = preResults.find((r) => !r.success);
    if (blocked) {
      return {
        output: `Hook '${blocked.hookName}' blocked execution: ${blocked.error}`,
        isError: true,
      };
    }
  }

  let result: ToolResult;

  try {
    switch (name) {
      case "Bash":
        result = await executeBash(
          input as { command: string; timeout?: number },
          workspace,
          context.signal,
        );
        break;
      case "Read":
        result = await executeRead(
          input as { file_path: string; offset?: number; limit?: number },
          workspace,
        );
        break;
      case "Write":
        result = await executeWrite(input as { file_path: string; content: string }, workspace);
        break;
      case "Edit":
        result = await executeEdit(
          input as {
            file_path: string;
            old_string: string;
            new_string: string;
          },
          workspace,
        );
        break;
      case "Glob":
        result = await executeGlob(input as { pattern: string; path?: string }, workspace);
        break;
      case "Grep":
        result = await executeGrep(
          input as { pattern: string; path?: string; include?: string },
          workspace,
        );
        break;
      case "WebSearch":
        result = await executeWebSearch(input as { query: string });
        break;
      case "WebFetch":
        result = await executeWebFetch(input as { url: string; prompt?: string });
        break;
      case "UpdateMemory":
        result = await executeUpdateMemory(input as { content: string; mode?: string }, context);
        break;
      case "HandoffToAgent":
        result = await executeHandoff(
          input as { targetAgentId: string; contextSummary: string },
          context,
        );
        break;
      case "InvokeAgent":
        result = await executeInvokeAgent(
          input as { targetAgentId: string; task: string },
          context,
        );
        break;
      case "SearchKnowledgeBase":
        result = await executeSearchKnowledgeBase(
          input as { query: string; limit?: number },
          context,
        );
        break;
      default: {
        // Check if it's an MCP tool
        if (name.startsWith("mcp_") && context.mcpManager) {
          const { executeMcpTool } = await import("../mcp/tool-bridge.js");
          result = await executeMcpTool(context.mcpManager, name, input);
        } else {
          result = { output: `Unknown tool: ${name}`, isError: true };
        }
      }
    }
  } catch (err) {
    result = {
      output: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }

  // Run post_tool hooks (don't block on failure)
  if (context.hookEngine) {
    try {
      const { HookEngine } = await import("../hooks/engine.js");
      const engine = context.hookEngine as InstanceType<typeof HookEngine>;
      const hookCtx = {
        tenantId: context.tenantId ?? "",
        agentId: context.agentId ?? "",
        sessionId: context.sessionId,
        toolName: name,
        toolInput: input,
        toolOutput: result.output,
      };
      await engine.runHooks("post_tool", hookCtx);
    } catch {
      // post_tool hooks should not break tool execution
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Path Security
// ---------------------------------------------------------------------------

function resolveSafePath(workspace: string, filePath: string): string {
  // Make path relative if absolute
  const relativePath = filePath.replace(/^\/+/, "");
  const resolved = path.resolve(workspace, relativePath);

  // Ensure resolved path is within workspace
  const normalizedWorkspace = path.resolve(workspace);
  if (!resolved.startsWith(normalizedWorkspace)) {
    throw new Error(`Path "${filePath}" resolves outside workspace`);
  }

  return resolved;
}

async function ensureWorkspace(workspace: string): Promise<void> {
  await fs.mkdir(workspace, { recursive: true });
}

// ---------------------------------------------------------------------------
// Tool Executors
// ---------------------------------------------------------------------------

async function executeBash(
  input: { command: string; timeout?: number },
  workspace: string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  await ensureWorkspace(workspace);
  const timeout = Math.min(input.timeout ?? 30000, 120000);

  if (signal?.aborted) {
    return { output: "Execution cancelled", isError: true };
  }

  try {
    const child = exec(input.command, {
      cwd: workspace,
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      shell: "/bin/bash",
      env: { ...process.env, HOME: workspace },
    });

    // Kill process on abort
    const onAbort = () => {
      child.kill("SIGTERM");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        let stdoutBuf = "";
        let stderrBuf = "";
        child.stdout?.on("data", (d: Buffer) => {
          stdoutBuf += d.toString();
        });
        child.stderr?.on("data", (d: Buffer) => {
          stderrBuf += d.toString();
        });
        child.on("close", () => {
          if (signal?.aborted) {
            reject(new Error("Execution cancelled"));
          } else {
            resolve({ stdout: stdoutBuf, stderr: stderrBuf });
          }
        });
        child.on("error", reject);
      },
    );

    signal?.removeEventListener("abort", onAbort);

    let output = "";
    if (stdout) output += stdout;
    if (stderr) output += (output ? "\n[stderr]\n" : "[stderr]\n") + stderr;
    if (!output) output = "(no output)";

    // Truncate if too long
    if (output.length > 100000) {
      output = output.slice(0, 100000) + "\n\n[Output truncated]";
    }

    return { output };
  } catch (err: unknown) {
    if (signal?.aborted) {
      return { output: "Execution cancelled", isError: true };
    }
    const e = err as {
      killed?: boolean;
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (e.killed) {
      return { output: `Command timed out after ${timeout}ms`, isError: true };
    }
    const output = (e.stdout || "") + (e.stderr ? "\n[stderr]\n" + e.stderr : "");
    return { output: output || e.message || "Command failed", isError: true };
  }
}

async function executeRead(
  input: { file_path: string; offset?: number; limit?: number },
  workspace: string,
): Promise<ToolResult> {
  try {
    const filePath = resolveSafePath(workspace, input.file_path);
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const offset = input.offset ?? 0;
    const limit = input.limit ?? lines.length;
    const selected = lines.slice(offset, offset + limit);
    const numbered = selected.map((line, i) => `${offset + i + 1}\t${line}`).join("\n");
    return { output: numbered || "(empty file)" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error reading file: ${msg}`, isError: true };
  }
}

async function executeWrite(
  input: { file_path: string; content: string },
  workspace: string,
): Promise<ToolResult> {
  try {
    const filePath = resolveSafePath(workspace, input.file_path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.content, "utf-8");
    return { output: `File written: ${input.file_path}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error writing file: ${msg}`, isError: true };
  }
}

async function executeEdit(
  input: { file_path: string; old_string: string; new_string: string },
  workspace: string,
): Promise<ToolResult> {
  try {
    const filePath = resolveSafePath(workspace, input.file_path);
    const content = await fs.readFile(filePath, "utf-8");

    if (!content.includes(input.old_string)) {
      return {
        output: `String not found in file: "${input.old_string.slice(0, 200)}"`,
        isError: true,
      };
    }

    const occurrences = content.split(input.old_string).length - 1;
    if (occurrences > 1) {
      return {
        output: `Found ${occurrences} occurrences of the string. Please provide more context to make a unique match.`,
        isError: true,
      };
    }

    const newContent = content.replace(input.old_string, input.new_string);
    await fs.writeFile(filePath, newContent, "utf-8");
    return { output: `File edited: ${input.file_path}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error editing file: ${msg}`, isError: true };
  }
}

async function executeGlob(
  input: { pattern: string; path?: string },
  workspace: string,
): Promise<ToolResult> {
  await ensureWorkspace(workspace);

  try {
    const searchDir = input.path ? resolveSafePath(workspace, input.path) : workspace;

    // Extract filename pattern from glob path
    const parts = input.pattern.split("/").filter((p) => p !== "**");
    const namePattern = parts[parts.length - 1] || "*";

    const { stdout } = await execAsync(
      `find "${searchDir}" -name "${namePattern}" -type f 2>/dev/null | sort | head -200`,
      { cwd: workspace, timeout: 15000 },
    );

    const files = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((f) => path.relative(workspace, f));

    return { output: files.join("\n") || "(no matches)" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error: ${msg}`, isError: true };
  }
}

async function executeGrep(
  input: { pattern: string; path?: string; include?: string },
  workspace: string,
): Promise<ToolResult> {
  await ensureWorkspace(workspace);

  try {
    const searchPath = input.path ? resolveSafePath(workspace, input.path) : workspace;
    const includeArg = input.include ? `--include="${input.include}"` : "";

    // Escape double quotes in pattern for shell
    const escapedPattern = input.pattern.replace(/"/g, '\\"');

    const { stdout } = await execAsync(
      `grep -rn ${includeArg} "${escapedPattern}" "${searchPath}" 2>/dev/null | head -200`,
      { cwd: workspace, timeout: 15000 },
    );

    // Make paths relative to workspace
    const output = stdout
      .split("\n")
      .map((line) => {
        if (line.startsWith(workspace)) {
          return line.slice(workspace.length + 1);
        }
        return line;
      })
      .join("\n");

    return { output: output || "(no matches)" };
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    // grep exit code 1 = no match (not an error)
    if (e.code === 1) return { output: "(no matches)" };
    return { output: `Error: ${e.message}`, isError: true };
  }
}

async function executeWebSearch(input: { query: string }): Promise<ToolResult> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    });

    const html = await res.text();

    // Parse search results from DuckDuckGo HTML
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Match result links
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push({
        url: decodeURIComponent(match[1].replace(/.*uddg=/, "").replace(/&.*/, "")),
        title: match[2].replace(/<[^>]*>/g, "").trim(),
      });
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(
        match[1]
          .replace(/<[^>]*>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .trim(),
      );
    }

    for (let i = 0; i < links.length && i < 10; i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || "",
      });
    }

    if (results.length === 0) {
      return { output: "No search results found." };
    }

    let output = `Search results for "${input.query}":\n\n`;
    for (let i = 0; i < results.length; i++) {
      output += `${i + 1}. ${results[i].title}\n`;
      output += `   ${results[i].url}\n`;
      if (results[i].snippet) {
        output += `   ${results[i].snippet}\n`;
      }
      output += "\n";
    }

    return { output };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Search error: ${msg}`, isError: true };
  }
}

async function executeWebFetch(input: { url: string; prompt?: string }): Promise<ToolResult> {
  try {
    const res = await fetch(input.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });

    let text = await res.text();
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      // Remove scripts and styles first
      text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
      text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
      text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
      // Convert common elements to text markers
      text = text.replace(/<br\s*\/?>/gi, "\n");
      text = text.replace(/<\/p>/gi, "\n\n");
      text = text.replace(/<\/div>/gi, "\n");
      text = text.replace(/<\/li>/gi, "\n");
      text = text.replace(/<\/h[1-6]>/gi, "\n\n");
      // Remove remaining HTML tags
      text = text.replace(/<[^>]*>/g, " ");
      // Decode HTML entities
      text = text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");
      // Clean up whitespace
      text = text.replace(/[ \t]+/g, " ");
      text = text.replace(/\n{3,}/g, "\n\n");
      text = text.trim();
    }

    // Truncate if too long
    if (text.length > 50000) {
      text = text.slice(0, 50000) + "\n\n[Content truncated at 50000 chars]";
    }

    return { output: text || "(empty response)" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Fetch error: ${msg}`, isError: true };
  }
}

async function executeUpdateMemory(
  input: { content: string; mode?: string },
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.agentId || !context.tenantId) {
    return {
      output: "Cannot update memory: missing agent or tenant context",
      isError: true,
    };
  }

  try {
    // Load current config
    const result = await query<{ config: Record<string, unknown> | null }>(
      `SELECT config FROM agent_configs WHERE id = $1 AND tenant_id = $2`,
      [context.agentId, context.tenantId],
    );

    if (result.rows.length === 0) {
      return { output: "Agent not found", isError: true };
    }

    const config = result.rows[0].config ?? {};
    const existingMemory = (config.memory as string) ?? "";

    let newMemory: string;
    if (input.mode === "append") {
      newMemory = existingMemory ? existingMemory + "\n\n" + input.content : input.content;
    } else {
      newMemory = input.content;
    }

    // Limit memory size to 50KB
    if (newMemory.length > 50000) {
      newMemory = newMemory.slice(0, 50000);
    }

    // Update config with new memory
    const updatedConfig = { ...config, memory: newMemory };
    await query(
      `UPDATE agent_configs SET config = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(updatedConfig), context.agentId, context.tenantId],
    );

    return {
      output: `Memory updated successfully (${newMemory.length} chars). This will be included in all future conversations.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error updating memory: ${msg}`, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Knowledge Base Tool Executor
// ---------------------------------------------------------------------------

async function executeSearchKnowledgeBase(
  input: { query: string; limit?: number },
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.agentId || !context.tenantId) {
    return {
      output: "Knowledge base search requires agent context",
      isError: true,
    };
  }
  try {
    const { searchKnowledgeBase } = await import("../knowledge-base/document-processor.js");
    const results = await searchKnowledgeBase(
      context.tenantId,
      context.agentId,
      input.query,
      input.limit ?? 5,
    );
    if (results.length === 0) {
      return { output: "No relevant results found in knowledge base." };
    }
    let output = "Knowledge Base Results:\n\n";
    for (const r of results) {
      output += `[${r.fileName}] (score: ${r.score.toFixed(3)})\n${r.content}\n\n---\n\n`;
    }
    return { output };
  } catch (err) {
    return {
      output: `KB search error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Multi-Agent Tool Executors
// ---------------------------------------------------------------------------

async function executeHandoff(
  input: { targetAgentId: string; contextSummary: string },
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.tenantId || !context.sessionId) {
    return { output: "Cannot handoff: missing context", isError: true };
  }
  try {
    const { handoffSession } = await import("../multi-agent/orchestrator.js");
    const result = await handoffSession(
      context.tenantId,
      context.sessionId,
      input.targetAgentId,
      input.contextSummary,
    );
    if (result.success) {
      return {
        output: `Conversation handed off to ${result.agentName}. Context: ${input.contextSummary}`,
      };
    }
    return { output: "Handoff failed: target agent not found", isError: true };
  } catch (err) {
    return {
      output: `Handoff error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}

async function executeInvokeAgent(
  input: { targetAgentId: string; task: string },
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.tenantId) {
    return { output: "Cannot invoke agent: missing context", isError: true };
  }
  try {
    const { invokeSubAgent } = await import("../multi-agent/orchestrator.js");
    const response = await invokeSubAgent(context.tenantId, input.targetAgentId, input.task);
    return { output: `Sub-agent response:\n\n${response}` };
  } catch (err) {
    return {
      output: `Invoke error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Streaming Tool Execution (Bash real-time output)
// ---------------------------------------------------------------------------

export type ToolStreamEvent =
  | { type: "stream"; chunk: string; stream: "stdout" | "stderr" }
  | { type: "result"; result: ToolResult };

export async function* executeToolStreaming(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext,
): AsyncGenerator<ToolStreamEvent> {
  const workspace = context.workspacePath ?? "/tmp/cerebro-default-workspace";

  if (name === "Bash") {
    yield* executeBashStreaming(input as { command: string; timeout?: number }, workspace);
    return;
  }

  // For all other tools, just yield the final result
  const result = await executeTool(name, input, context);
  yield { type: "result", result };
}

async function* executeBashStreaming(
  input: { command: string; timeout?: number },
  workspace: string,
): AsyncGenerator<ToolStreamEvent> {
  await ensureWorkspace(workspace);
  const timeout = Math.min(input.timeout ?? 30000, 120000);

  const proc = spawn("bash", ["-c", input.command], {
    cwd: workspace,
    env: { ...process.env, HOME: workspace },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let fullOutput = "";
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
  }, timeout);

  // Create async iterable from process streams
  const chunks: Array<{ chunk: string; stream: "stdout" | "stderr" }> = [];
  let resolve: (() => void) | null = null;
  let done = false;

  const pushChunk = (chunk: string, stream: "stdout" | "stderr") => {
    chunks.push({ chunk, stream });
    if (resolve) {
      resolve();
      resolve = null;
    }
  };

  proc.stdout.on("data", (data: Buffer) => {
    const text = data.toString();
    fullOutput += text;
    pushChunk(text, "stdout");
  });

  proc.stderr.on("data", (data: Buffer) => {
    const text = data.toString();
    fullOutput += "[stderr] " + text;
    pushChunk(text, "stderr");
  });

  proc.on("close", () => {
    done = true;
    if (resolve) {
      resolve();
      resolve = null;
    }
  });

  proc.on("error", (err) => {
    fullOutput += `\nProcess error: ${err.message}`;
    done = true;
    if (resolve) {
      resolve();
      resolve = null;
    }
  });

  // Yield chunks as they arrive
  while (true) {
    while (chunks.length > 0) {
      const c = chunks.shift()!;
      yield { type: "stream" as const, chunk: c.chunk, stream: c.stream };
    }
    if (done) break;
    await new Promise<void>((r) => {
      resolve = r;
    });
  }

  clearTimeout(timer);

  if (timedOut) {
    yield {
      type: "result" as const,
      result: { output: `Command timed out after ${timeout}ms`, isError: true },
    };
  } else {
    // Truncate if too long
    let output = fullOutput || "(no output)";
    if (output.length > 100000) {
      output = output.slice(0, 100000) + "\n\n[Output truncated]";
    }
    yield { type: "result" as const, result: { output } };
  }
}
