import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class McpClientManager {
  private clients = new Map<string, Client>();
  private tools = new Map<string, McpTool[]>();

  async connect(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.id)) return;

    const client = new Client({ name: "openclaw", version: "1.0.0" }, { capabilities: {} });

    if (config.transport === "stdio" && config.command) {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
      });
      await client.connect(transport);
    } else if (config.transport === "sse" && config.url) {
      const transport = new SSEClientTransport(new URL(config.url));
      await client.connect(transport);
    } else {
      throw new Error(`Invalid MCP config for ${config.name}`);
    }

    this.clients.set(config.id, client);

    // Discover tools
    try {
      const result = await client.listTools();
      const mcpTools = (result.tools ?? []).map(
        (t: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => ({
          serverId: config.id,
          serverName: config.name,
          name: t.name,
          description: t.description ?? "",
          inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        }),
      );
      this.tools.set(config.id, mcpTools);
    } catch {
      this.tools.set(config.id, []);
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      this.clients.delete(serverId);
      this.tools.delete(serverId);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const id of this.clients.keys()) {
      await this.disconnect(id);
    }
  }

  getAllTools(): McpTool[] {
    const allTools: McpTool[] = [];
    for (const tools of this.tools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  getToolsForServer(serverId: string): McpTool[] {
    return this.tools.get(serverId) ?? [];
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server ${serverId} not connected`);

    const result = await client.callTool({ name: toolName, arguments: args });

    if (result.content && Array.isArray(result.content)) {
      return result.content
        .map((c: { type: string; text?: string }) =>
          c.type === "text" ? c.text : JSON.stringify(c),
        )
        .join("\n");
    }
    return JSON.stringify(result);
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId);
  }
}
