export interface HookDefinition {
  id: string;
  name: string;
  type: "pre_tool" | "post_tool" | "pre_message" | "post_message";
  action: "shell" | "webhook";
  command?: string; // for shell hooks
  url?: string; // for webhook hooks
  timeout?: number; // ms, default 10000
  toolNames?: string[]; // filter: only run for specific tools (empty = all)
  blockOnFailure?: boolean; // if true, stop execution if hook fails
  enabled?: boolean;
}

export interface HookContext {
  tenantId: string;
  agentId: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  message?: string;
}

export interface HookResult {
  hookId: string;
  hookName: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}
