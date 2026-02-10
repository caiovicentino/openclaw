import type { ToolDefinition, ToolResult } from "../llm/tools.js";
import type { McpClientManager, McpTool } from "./client.js";

export function mcpToolToDefinition(tool: McpTool): ToolDefinition {
  return {
    name: `mcp_${tool.serverId}_${tool.name}`,
    description: `[MCP: ${tool.serverName}] ${tool.description}`,
    input_schema: tool.inputSchema as ToolDefinition["input_schema"],
  };
}

export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith("mcp_");
}

export function parseMcpToolName(toolName: string): { serverId: string; toolName: string } | null {
  if (!toolName.startsWith("mcp_")) return null;
  const parts = toolName.slice(4).split("_");
  if (parts.length < 2) return null;
  const serverId = parts[0];
  const actualName = parts.slice(1).join("_");
  return { serverId, toolName: actualName };
}

export async function executeMcpTool(
  manager: McpClientManager,
  fullToolName: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const parsed = parseMcpToolName(fullToolName);
  if (!parsed) return { output: `Invalid MCP tool name: ${fullToolName}`, isError: true };

  try {
    const output = await manager.callTool(parsed.serverId, parsed.toolName, input);
    return { output };
  } catch (err) {
    return {
      output: `MCP tool error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}
