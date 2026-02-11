import { stackApp } from "@/auth/stack-client";
import type { ChatAgent, ChatSession, ChatMessage, ChatUsage } from "./types";
import { client } from "./client";

async function getAccessToken(): Promise<string | null> {
  const user = await stackApp.getUser();
  if (!user) return null;
  const authJson = await user.getAuthJson();
  return authJson?.accessToken ?? null;
}

const BASE_URL = "/api/v1";

export interface PermissionRequestData {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel: string;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolStream?: (data: { id: string; name: string; chunk: string; stream: string }) => void;
  onToolStart?: (data: { name: string; summary: string }) => void;
  onToolEnd?: (data: { name: string; success: boolean }) => void;
  onPermissionRequest?: (data: PermissionRequestData) => void;
  onDone: (data: { sessionId: string; usage: ChatUsage }) => void;
  onError: (error: string) => void;
}

export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
}

export async function uploadFile(file: File, sessionId?: string): Promise<UploadedFile> {
  const token = await getAccessToken();
  const formData = new FormData();
  formData.append("file", file);
  if (sessionId) formData.append("sessionId", sessionId);

  const res = await fetch(`${BASE_URL}/chat/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(((errBody as Record<string, unknown>)?.message as string) ?? "Upload failed");
  }
  return res.json();
}

function formatToolOutput(toolName: string, output: string): string {
  if (!output) return "Done";

  if (toolName === "Write" || toolName === "Edit") {
    const pathMatch = output.match(/(?:wrote|edited|created|updated)\s+`?([^\s`]+)`?/i);
    const filePath = pathMatch?.[1] || output.split("\n")[0].slice(0, 200);
    return `File written: ${filePath}`;
  }

  if (toolName === "Read") {
    const lineCount = output.split("\n").length;
    const truncated =
      output.length > 2000
        ? output.slice(0, 2000) + `\n... (${output.length - 2000} more chars)`
        : output;
    return `Read ${lineCount} lines\n${truncated}`;
  }

  const limit = toolName === "WebSearch" || toolName === "WebFetch" ? 1000 : 2000;
  if (output.length > limit) {
    return output.slice(0, limit) + `\n... (${output.length - limit} more chars)`;
  }

  return output;
}

export async function sendChatMessage(
  agentId: string,
  message: string,
  sessionId: string | null,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  files?: UploadedFile[],
): Promise<void> {
  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      agentId,
      message,
      ...(sessionId ? { sessionId } : {}),
      ...(files?.length ? { files } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const errMsg = (errBody as Record<string, unknown>)?.message ?? res.statusText;
    callbacks.onError(String(errMsg));
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response stream");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  let lastToolName = "";
  let hadBashStream = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr) as Record<string, unknown>;

          switch (data.type) {
            case "text":
              callbacks.onText(data.content as string);
              break;
            case "thinking":
              callbacks.onThinking?.(data.content as string);
              break;
            case "tool_use": {
              const name = data.name as string;
              const input = data.input as Record<string, unknown>;
              lastToolName = name;
              hadBashStream = false;

              let summary = "";
              if (name === "Bash") {
                const cmd = (input.command as string) ?? "";
                summary = cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd;
                callbacks.onText(`\n<terminal command="${cmd.replace(/"/g, "&quot;")}">`);
              } else {
                if (name === "WebSearch") {
                  summary = `query: "${input.query}"`;
                } else if (name === "WebFetch") {
                  summary = `url: ${input.url}`;
                } else if (name === "Read" || name === "Write" || name === "Edit") {
                  summary = `${input.file_path}`;
                } else if (name === "Glob") {
                  summary = `pattern: ${input.pattern}`;
                } else if (name === "Grep") {
                  summary = `/${input.pattern}/`;
                } else {
                  summary = JSON.stringify(input).slice(0, 100);
                }
                const safeName = name.replace(/"/g, "&quot;");
                const safeSummary = summary.replace(/"/g, "&quot;");
                callbacks.onText(`\n<toolblock name="${safeName}" summary="${safeSummary}">`);
              }
              callbacks.onToolStart?.({ name, summary });
              break;
            }
            case "tool_result": {
              const isErr = data.isError as boolean;
              const output = (data.output as string) || "";
              const finishedToolName = lastToolName;

              if (lastToolName === "Bash") {
                if (isErr) {
                  callbacks.onText(
                    `\n❌ Error: ${output.length > 500 ? output.slice(0, 500) + "..." : output}`,
                  );
                } else if (!hadBashStream && output) {
                  callbacks.onText(output);
                }
                callbacks.onText("</terminal>\n\n");
              } else {
                const toolOutput = isErr
                  ? `ERROR: ${output.length > 500 ? output.slice(0, 500) + "..." : output}`
                  : formatToolOutput(lastToolName, output);
                callbacks.onText(`${toolOutput}</toolblock>\n\n`);
              }
              callbacks.onToolEnd?.({ name: finishedToolName, success: !isErr });
              lastToolName = "";
              hadBashStream = false;
              break;
            }
            case "tool_stream": {
              const streamName = (data.name as string) || lastToolName;
              if (streamName === "Bash") {
                hadBashStream = true;
                callbacks.onText(data.chunk as string);
              } else {
                callbacks.onToolStream?.({
                  id: data.id as string,
                  name: streamName,
                  chunk: data.chunk as string,
                  stream: data.stream as string,
                });
              }
              break;
            }
            case "tool_permission_request": {
              callbacks.onPermissionRequest?.({
                id: data.id as string,
                toolName: data.toolName as string,
                toolInput: data.toolInput as Record<string, unknown>,
                riskLevel: data.riskLevel as string,
              });
              break;
            }
            case "file_created": {
              const filePath = data.path as string;
              callbacks.onText(`\n\u{1F4C4} Created: \`${filePath}\`\n`);
              break;
            }
            case "agent_switch":
              callbacks.onText(`\n\n--- Agent Switch: ${data.message as string} ---\n\n`);
              break;
            case "done":
              callbacks.onDone({
                sessionId: data.sessionId as string,
                usage: data.usage as ChatUsage,
              });
              break;
            case "error":
              callbacks.onError(data.error as string);
              break;
          }
        } catch {
          // Skip malformed SSE data
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    callbacks.onError((err as Error).message);
  }
}

export async function fetchAgents(): Promise<ChatAgent[]> {
  const res = await client.get<{ agents: ChatAgent[] }>("/chat/agents");
  return res.agents;
}

export async function fetchSessions(): Promise<ChatSession[]> {
  const res = await client.get<{ sessions: ChatSession[]; total: number }>("/chat/sessions");
  return res.sessions;
}

export async function createSession(agentId?: string, title?: string): Promise<ChatSession> {
  return client.post<ChatSession>("/chat/sessions", { agentId, title });
}

export async function fetchSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await client.get<{
    messages: Array<{ id: number | string; role: string; content: string; createdAt?: string }>;
  }>(`/chat/sessions/${sessionId}/messages`);
  return res.messages.map((m) => ({
    id: String(m.id),
    role: m.role as "user" | "assistant",
    content: m.content,
    createdAt: m.createdAt,
  }));
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  await client.patch(`/chat/sessions/${sessionId}`, { title });
}

export async function deleteSessionApi(sessionId: string): Promise<void> {
  await client.delete(`/chat/sessions/${sessionId}`);
}

export async function respondToPermissionRequest(
  sessionId: string,
  approvalId: string,
  approved: boolean,
  alwaysAllow = false,
): Promise<void> {
  const token = await getAccessToken();
  await fetch(`${BASE_URL}/chat/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sessionId, approvalId, approved, alwaysAllow }),
  });
}

export interface WorkspaceFile {
  path: string;
  size: number;
  modified: string;
}

export async function fetchWorkspaceFiles(sessionId: string): Promise<WorkspaceFile[]> {
  const res = await client.get<{ files: WorkspaceFile[] }>(`/chat/sessions/${sessionId}/files`);
  return res.files;
}

export async function fetchFileContent(sessionId: string, filePath: string): Promise<string> {
  const res = await client.get<{ content: string }>(
    `/chat/sessions/${sessionId}/files/${encodeURIComponent(filePath)}`,
  );
  return res.content;
}

export async function downloadWorkspace(sessionId: string): Promise<Blob> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/chat/sessions/${sessionId}/download`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error("Download failed");
  return res.blob();
}
