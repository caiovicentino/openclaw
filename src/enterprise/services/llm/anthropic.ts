import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmProviderConfig, LlmMessage, LlmStreamChunk } from "./provider.js";
import { buildAnthropicClientOptions, isOAuthToken } from "./tenant-settings.js";
import { SessionApprovalPolicy, getToolRiskLevel } from "./tool-approval.js";
import { getToolDefinitions, executeToolStreaming, type ToolContext } from "./tools.js";

const CLAUDE_CODE_SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude.";

const MAX_TOOL_TURNS = 25;

const TASK_COMPLETION_INSTRUCTIONS = `
## MANDATORY: Use Tools for All Creation Tasks

You are a coding agent with full tool access. You MUST use tools to build things.

NEVER output raw code, HTML, or file contents as plain text in your response.
ALWAYS use the Write tool to create files. ALWAYS use Bash to run commands.

### Workflow for ANY creation request:
1. Use Write tool to create each file
2. Use Bash to install dependencies if needed
3. Use Bash to verify the build works
4. Provide a brief text summary of what was created
5. Optionally show a preview with <artifact> tags AFTER writing the files

### Example — user asks "create a landing page":
Step 1: Use Write tool → create index.html with full HTML content
Step 2: Text response → "I created index.html with your landing page."
Step 3: (Optional) <artifact type="html" title="Preview">same content</artifact>

### What NOT to do:
- Do NOT paste code/HTML directly in your response text
- Do NOT skip tool usage and just describe what you would do
- Do NOT output <artifact> tags without first writing the actual files

### Project setup:
- Use Bash for: npm init, package installation, build commands
- Create complete project structures with all config files
- Always finish the entire task before responding
`;

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private oauthMode: boolean;

  constructor(apiKey?: string) {
    this.oauthMode = Boolean(apiKey && isOAuthToken(apiKey));
    const opts = apiKey
      ? buildAnthropicClientOptions(apiKey)
      : { apiKey: process.env.ANTHROPIC_API_KEY };
    this.client = new Anthropic(opts);
  }

  async *streamChat(
    config: LlmProviderConfig,
    messages: LlmMessage[],
  ): AsyncGenerator<LlmStreamChunk> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const customSystemPrompt =
      config.systemPrompt ||
      (systemMessages.length > 0 ? systemMessages.map((m) => m.content).join("\n\n") : undefined);

    // Build system parameter
    let systemParam: string | Array<{ type: "text"; text: string }> | undefined;

    if (this.oauthMode) {
      const blocks: Array<{ type: "text"; text: string }> = [
        { type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX },
      ];
      if (customSystemPrompt) {
        blocks.push({ type: "text", text: customSystemPrompt });
      }
      if (config.enableTools) {
        blocks.push({ type: "text", text: TASK_COMPLETION_INSTRUCTIONS });
      }
      if (!config.enableTools) {
        blocks.push({
          type: "text",
          text: "IMPORTANT: You are running inside a web chat interface. You do NOT have access to any tools, file system, terminal, or web search. Respond directly to the user in a helpful, conversational way. Never output XML tags like <search>, <tool>, <result>, etc. Use markdown formatting for readability.",
        });
      }
      systemParam = blocks;
    } else {
      if (config.enableTools) {
        systemParam = customSystemPrompt
          ? `${customSystemPrompt}\n\n${TASK_COMPLETION_INSTRUCTIONS}`
          : TASK_COMPLETION_INSTRUCTIONS;
      } else {
        systemParam = customSystemPrompt;
      }
    }

    // Build tool definitions if enabled, merging MCP tools
    let mcpToolDefs: import("./tools.js").ToolDefinition[] = [];
    if (config.mcpManager) {
      const { mcpToolToDefinition } = await import("../mcp/tool-bridge.js");
      mcpToolDefs = config.mcpManager
        .getAllTools()
        .map((t: import("../mcp/client.js").McpTool) => mcpToolToDefinition(t));
    }
    const toolDefs = config.enableTools ? getToolDefinitions(mcpToolDefs) : undefined;

    // Convert initial messages to Anthropic format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anthropicMessages: Array<{ role: "user" | "assistant"; content: any }> = chatMessages.map(
      (m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }),
    );

    const totalUsage = { inputTokens: 0, outputTokens: 0 };
    let turnCount = 0;

    while (turnCount < MAX_TOOL_TURNS) {
      if (config.signal?.aborted) break;
      turnCount++;

      const stream = this.client.messages.stream({
        model: config.model,
        max_tokens: config.maxTokens ?? (config.enableTools ? 16384 : 4096),
        temperature: config.temperature ?? 0.7,
        ...(config.topP !== undefined ? { top_p: config.topP } : {}),
        ...(systemParam ? { system: systemParam } : {}),
        ...(toolDefs ? { tools: toolDefs as Anthropic.Messages.Tool[] } : {}),
        ...(!this.oauthMode ? { betas: ["interleaved-thinking-2025-05-14"] } : {}),
        messages: anthropicMessages,
        stream: true,
      } as Anthropic.Messages.MessageCreateParamsStreaming);

      // Stream text deltas to client
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text_delta", text: event.delta.text };
        } else if (
          event.type === "content_block_delta" &&
          (event.delta as any).type === "thinking_delta"
        ) {
          yield { type: "thinking" as const, thinking: (event.delta as any).thinking };
        }
      }

      const finalMessage = await stream.finalMessage();
      totalUsage.inputTokens += finalMessage.usage.input_tokens;
      totalUsage.outputTokens += finalMessage.usage.output_tokens;

      if (finalMessage.stop_reason === "tool_use" && config.enableTools) {
        // Extract tool_use blocks
        const toolUses = finalMessage.content.filter(
          (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
        );

        // Execute tools and collect results
        const toolResults: Array<{
          type: "tool_result";
          tool_use_id: string;
          content: string;
          is_error?: boolean;
        }> = [];

        for (const tu of toolUses) {
          // Emit tool_use event to client
          yield {
            type: "tool_use" as const,
            toolUse: {
              id: tu.id,
              name: tu.name,
              input: tu.input as Record<string, unknown>,
            },
          };

          // Check if tool needs approval
          const approvalPolicy = config.approvalPolicy as SessionApprovalPolicy | undefined;
          if (approvalPolicy?.needsApproval(tu.name)) {
            const { id: approvalId, promise: approvalPromise } =
              approvalPolicy.createApprovalRequest(tu.name, tu.input as Record<string, unknown>);
            yield {
              type: "tool_permission_request" as const,
              permissionRequest: {
                id: approvalId,
                toolName: tu.name,
                toolInput: tu.input as Record<string, unknown>,
                riskLevel: getToolRiskLevel(tu.name),
              },
            };
            const approved = await approvalPromise;
            if (!approved) {
              yield {
                type: "tool_result" as const,
                toolResult: {
                  id: tu.id,
                  name: tu.name,
                  output: "Tool execution denied by user",
                  isError: true,
                },
              };
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: "Tool execution denied by user",
                is_error: true,
              });
              continue;
            }
          }

          // Execute the tool server-side with streaming
          const toolCtx: ToolContext = {
            workspacePath: config.workspacePath,
            agentId: config.agentId,
            tenantId: config.tenantId,
            sessionId: config.sessionId,
            signal: config.signal,
            mcpManager: config.mcpManager,
            hookEngine: config.hookEngine,
          };

          let toolResult: { output: string; isError?: boolean } = { output: "" };

          for await (const event of executeToolStreaming(
            tu.name,
            tu.input as Record<string, unknown>,
            toolCtx,
          )) {
            if (event.type === "stream") {
              yield {
                type: "tool_stream" as const,
                toolStream: {
                  id: tu.id,
                  name: tu.name,
                  chunk: event.chunk,
                  stream: event.stream,
                },
              };
            } else {
              toolResult = event.result;
            }
          }

          yield {
            type: "tool_result" as const,
            toolResult: {
              id: tu.id,
              name: tu.name,
              output: toolResult.output,
              isError: toolResult.isError,
            },
          };

          if ((tu.name === "Write" || tu.name === "Edit") && !toolResult.isError) {
            const filePath = (tu.input as Record<string, unknown>).file_path as string;
            yield {
              type: "file_created" as const,
              fileCreated: {
                path: filePath,
                toolName: tu.name,
              },
            };
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: toolResult.output,
            ...(toolResult.isError ? { is_error: true } : {}),
          });
        }

        // Append assistant message + tool results for next turn
        anthropicMessages.push({
          role: "assistant",
          content: finalMessage.content,
        });
        anthropicMessages.push({
          role: "user",
          content: toolResults,
        });

        // Continue to next iteration
      } else {
        // Done - end_turn or max_tokens
        break;
      }
    }

    yield {
      type: "usage",
      usage: totalUsage,
    };

    yield { type: "done" };
  }
}
