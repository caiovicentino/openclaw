// ---------------------------------------------------------------------------
// LLM Provider interfaces
// ---------------------------------------------------------------------------

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmStreamChunk {
  type:
    | "text_delta"
    | "thinking"
    | "tool_use"
    | "tool_result"
    | "tool_stream"
    | "tool_permission_request"
    | "usage"
    | "done"
    | "error";
  text?: string;
  thinking?: string;
  toolUse?: { id: string; name: string; input: Record<string, unknown> };
  toolResult?: {
    id: string;
    name: string;
    output: string;
    isError?: boolean;
  };
  toolStream?: { id: string; name: string; chunk: string; stream: "stdout" | "stderr" };
  permissionRequest?: {
    id: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    riskLevel: string;
  };
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

export interface LlmProviderConfig {
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  enableTools?: boolean;
  workspacePath?: string;
  agentId?: string;
  tenantId?: string;
  sessionId?: string;
  signal?: AbortSignal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approvalPolicy?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpManager?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hookEngine?: any;
}

export interface LlmProvider {
  readonly name: string;
  streamChat(config: LlmProviderConfig, messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk>;
}
