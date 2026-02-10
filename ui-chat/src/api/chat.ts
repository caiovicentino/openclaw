import type { ChatAgent, ChatSession, ChatMessage, ChatUsage } from "./types";
import { client } from "./client";

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
  const token = localStorage.getItem("access_token");
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

export async function sendChatMessage(
  agentId: string,
  message: string,
  sessionId: string | null,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  files?: UploadedFile[],
): Promise<void> {
  const token = localStorage.getItem("access_token");

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
              // Show tool usage inline as formatted text
              let summary = "";
              if (name === "WebSearch") {
                summary = `query: "${input.query}"`;
              } else if (name === "WebFetch") {
                summary = `url: ${input.url}`;
              } else if (name === "Bash") {
                summary = `$ ${(input.command as string)?.slice(0, 100)}`;
              } else if (name === "Read" || name === "Write" || name === "Edit") {
                summary = `${input.file_path}`;
              } else if (name === "Glob") {
                summary = `pattern: ${input.pattern}`;
              } else if (name === "Grep") {
                summary = `/${input.pattern}/`;
              } else {
                summary = JSON.stringify(input).slice(0, 100);
              }
              callbacks.onText(`\n\n\u{1F527} ${name}: ${summary}\n`);
              break;
            }
            case "tool_result": {
              const isErr = data.isError as boolean;
              const output = (data.output as string) || "";
              if (isErr) {
                callbacks.onText(`\u274C Error: ${output.slice(0, 200)}\n\n`);
              } else {
                callbacks.onText(`\u2705 Done (${output.length} chars)\n\n`);
              }
              break;
            }
            case "tool_stream": {
              callbacks.onToolStream?.({
                id: data.id as string,
                name: data.name as string,
                chunk: data.chunk as string,
                stream: data.stream as string,
              });
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
  const token = localStorage.getItem("access_token");
  await fetch(`${BASE_URL}/chat/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sessionId, approvalId, approved, alwaysAllow }),
  });
}
