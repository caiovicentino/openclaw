import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  TestTube,
  Server,
  Terminal,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { client } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- Types ---

interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

interface McpTool {
  name: string;
  description: string;
}

interface TestResult {
  ok: boolean;
  toolCount?: number;
  tools?: McpTool[];
  error?: string;
}

// --- API ---

function getMcpServers(agentId: string) {
  return client.get<{ servers: McpServerConfig[] }>(`/mcp/agents/${agentId}/servers`);
}

function addMcpServer(agentId: string, data: Omit<McpServerConfig, "id">) {
  return client.post<{ server: McpServerConfig }>(`/mcp/agents/${agentId}/servers`, data);
}

function removeMcpServer(agentId: string, serverId: string) {
  return client.delete(`/mcp/agents/${agentId}/servers/${serverId}`);
}

function testMcpServer(agentId: string, serverId: string) {
  return client.post<TestResult>(`/mcp/agents/${agentId}/servers/${serverId}/test`);
}

// --- Add Server Form ---

function AddServerForm({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [transport, setTransport] = useState<"stdio" | "sse">("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [envPairs, setEnvPairs] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const envObj: Record<string, string> = {};
      if (envPairs.trim()) {
        for (const line of envPairs.split("\n")) {
          const idx = line.indexOf("=");
          if (idx > 0) {
            envObj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        }
      }

      const data: Omit<McpServerConfig, "id"> = {
        name,
        transport,
        ...(transport === "stdio"
          ? {
              command,
              args: args
                .split(" ")
                .map((a) => a.trim())
                .filter(Boolean),
            }
          : { url }),
        ...(Object.keys(envObj).length > 0 ? { env: envObj } : {}),
      };
      return addMcpServer(agentId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "mcp-servers"],
      });
      onClose();
    },
  });

  const isValid =
    name.trim() &&
    ((transport === "stdio" && command.trim()) || (transport === "sse" && url.trim()));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add MCP Server</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="server-name">Server Name</Label>
          <Input
            id="server-name"
            placeholder="e.g. filesystem, github"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Transport</Label>
          <Select value={transport} onValueChange={(v) => setTransport(v as "stdio" | "sse")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">
                <span className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5" />
                  stdio (local process)
                </span>
              </SelectItem>
              <SelectItem value="sse">
                <span className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  SSE (remote URL)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {transport === "stdio" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="command">Command</Label>
              <Input
                id="command"
                placeholder="e.g. npx, python3, node"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="args">Arguments (space-separated)</Label>
              <Input
                id="args"
                placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="url">Server URL</Label>
            <Input
              id="url"
              placeholder="https://example.com/mcp/sse"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="env">Environment Variables (one per line, KEY=VALUE)</Label>
          <textarea
            id="env"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={"API_KEY=sk-...\nDATABASE_URL=postgres://..."}
            value={envPairs}
            onChange={(e) => setEnvPairs(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add Server
          </Button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Failed to add server"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --- Server Card ---

function ServerCard({ agentId, server }: { agentId: string; server: McpServerConfig }) {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () => removeMcpServer(agentId, server.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent", agentId, "mcp-servers"],
      });
    },
  });

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testMcpServer(agentId, server.id);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Server className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">{server.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {server.transport === "stdio" ? (
                    <Terminal className="mr-1 h-3 w-3" />
                  ) : (
                    <Globe className="mr-1 h-3 w-3" />
                  )}
                  {server.transport}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {server.transport === "stdio"
                    ? `${server.command} ${(server.args ?? []).join(" ")}`
                    : server.url}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {testResult && (
          <div
            className={`mt-3 rounded-md border p-3 ${
              testResult.ok
                ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              {testResult.ok ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-700 dark:text-green-400">
                    Connected - {testResult.toolCount} tool
                    {testResult.toolCount === 1 ? "" : "s"} available
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-red-700 dark:text-red-400">{testResult.error}</span>
                </>
              )}
            </div>
            {testResult.ok && testResult.tools && testResult.tools.length > 0 && (
              <div className="mt-2 space-y-1">
                {testResult.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <Wrench className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    <div>
                      <span className="font-mono font-medium">{tool.name}</span>
                      {tool.description && <span className="ml-1">&mdash; {tool.description}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Main Tab ---

export function McpServersTab({ agentId }: { agentId: string }) {
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agent", agentId, "mcp-servers"],
    queryFn: () => getMcpServers(agentId),
  });

  const servers = data?.servers ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="h-8 w-8 rounded-md bg-muted" />
              <div className="space-y-1">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-3 w-48 rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Connect external tools via MCP (Model Context Protocol) servers. Tools discovered from
            MCP servers will be available to the agent during chat.
          </p>
        </div>
        {!showAdd && (
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Server
          </Button>
        )}
      </div>

      {showAdd && <AddServerForm agentId={agentId} onClose={() => setShowAdd(false)} />}

      {servers.length === 0 && !showAdd ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <Server className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No MCP servers</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add an MCP server to extend your agent with external tools.
          </p>
          <Button onClick={() => setShowAdd(true)} className="mt-4" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Server
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => (
            <ServerCard key={server.id} agentId={agentId} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}
