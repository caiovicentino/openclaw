import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { TenantContext } from "../../context/tenant-context.js";
import type { LlmMessage } from "../../services/llm/index.js";
import { getAuditLogger } from "../../audit/audit-logger.js";
import { query } from "../../db/connection.js";
import {
  createSession,
  getSessionById,
  listUserSessions,
  deleteSession,
  updateSession,
  appendTranscriptEntry,
  getTranscript,
} from "../../db/repositories/session-repo.js";
import { recordUsage } from "../../db/repositories/usage-repo.js";
import { requirePermission } from "../../rbac/middleware.js";
import { processFileForLlm } from "../../services/llm/file-processor.js";
import { getLlmProvider, calculateCost, getModelProvider } from "../../services/llm/index.js";
import { loadProjectInstructions } from "../../services/llm/project-instructions.js";
import { getTenantModelSettings } from "../../services/llm/tenant-settings.js";
import { SessionApprovalPolicy } from "../../services/llm/tool-approval.js";
import { checkQuota } from "../../services/rate-limiter/quota-service.js";
import { badRequest, notFound } from "../errors.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const sendMessageSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(32_000),
  files: z
    .array(
      z.object({
        fileId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        path: z.string(),
      }),
    )
    .max(5)
    .optional(),
});

const createSessionSchema = z.object({
  agentId: z.string().optional(),
  title: z.string().optional(),
});

const updateSessionSchema = z.object({
  title: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const chat = new Hono();

// In-memory store for active approval policies keyed by sessionId
const activeApprovalPolicies = new Map<string, SessionApprovalPolicy>();

/** GET /chat/agents - List active agents available for chat */
chat.get("/agents", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;

  const result = await query(
    `SELECT id, tenant_id, config, created_at, updated_at
       FROM agent_configs
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
    [ctx.tenantId],
  );

  const agents = result.rows
    .map((row) => {
      const cfg = (row.config ?? {}) as Record<string, unknown>;
      const status = (cfg.status as string) ?? "active";
      if (status !== "active") return null;
      return {
        id: row.id,
        name: (cfg.name as string) ?? "",
        description: (cfg.description as string | null) ?? null,
        model: (cfg.model as string) ?? "",
        isDefault: (cfg.isDefault as boolean) ?? false,
      };
    })
    .filter(Boolean);

  return c.json({ agents });
});

/** GET /chat/sessions - List sessions for the logged-in user */
chat.get("/sessions", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const { sessions, total } = await listUserSessions(ctx.tenantId, ctx.userId, {
    limit: 100,
    offset: 0,
  });

  return c.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      agentId: s.agentId,
      title: (s.sessionData as Record<string, unknown>)?.title ?? "New Chat",
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    total,
  });
});

/** POST /chat/sessions - Create a new empty session */
chat.post("/sessions", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const body = await c.req.json();
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  const session = await createSession(ctx.tenantId, {
    userId: ctx.userId,
    agentId: parsed.data.agentId,
    sessionKey: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionData: { title: parsed.data.title ?? "New Chat" },
  });

  return c.json(
    {
      id: session.id,
      agentId: session.agentId,
      title: (session.sessionData as Record<string, unknown>)?.title ?? "New Chat",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    201,
  );
});

/** GET /chat/sessions/:id/messages - Get message history for a session */
chat.get("/sessions/:id/messages", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const sessionId = c.req.param("id");

  const session = await getSessionById(ctx.tenantId, sessionId);
  if (!session || session.userId !== ctx.userId) {
    return notFound(c, "Session");
  }

  const entries = await getTranscript(ctx.tenantId, sessionId, { limit: 500 });

  const messages = entries
    .filter((e) => e.role === "user" || e.role === "assistant")
    .map((e) => ({
      id: e.id,
      role: e.role,
      content: e.content ?? "",
      createdAt: e.createdAt,
    }));

  return c.json({ messages });
});

/** PATCH /chat/sessions/:id - Rename a session */
chat.patch("/sessions/:id", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const sessionId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  const session = await getSessionById(ctx.tenantId, sessionId);
  if (!session || session.userId !== ctx.userId) {
    return notFound(c, "Session");
  }

  const currentData = (session.sessionData ?? {}) as Record<string, unknown>;
  const updated = await updateSession(ctx.tenantId, sessionId, {
    sessionData: { ...currentData, title: parsed.data.title },
  });

  return c.json({
    id: updated.id,
    title: parsed.data.title,
    updatedAt: updated.updatedAt,
  });
});

/** DELETE /chat/sessions/:id - Delete own session */
chat.delete("/sessions/:id", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const sessionId = c.req.param("id");

  const session = await getSessionById(ctx.tenantId, sessionId);
  if (!session || session.userId !== ctx.userId) {
    return notFound(c, "Session");
  }

  await deleteSession(ctx.tenantId, sessionId);
  return c.json({ ok: true });
});

/** POST /chat - Send a message and receive streaming SSE response */
chat.post("/", requirePermission("agent:chat"), async (c) => {
  const ctx = c.get("tenantContext") as TenantContext;
  const body = await c.req.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(c, "Validation error", parsed.error.issues);
  }

  const { agentId, message } = parsed.data;
  let { sessionId } = parsed.data;

  // Check rate limits
  const quotaStatus = await checkQuota(ctx.tenantId, ctx.userId, agentId);
  if (!quotaStatus.allowed) {
    return c.json(
      {
        error: "RATE_LIMITED",
        message: "Rate limit exceeded",
        quotas: quotaStatus.quotas.filter((q) => q.remaining <= 0),
      },
      429,
    );
  }

  // 1. Load agent config
  const agentResult = await query("SELECT * FROM agent_configs WHERE id = $1 AND tenant_id = $2", [
    agentId,
    ctx.tenantId,
  ]);

  if (agentResult.rows.length === 0) {
    return notFound(c, "Agent");
  }

  const agentRow = agentResult.rows[0];
  const agentConfig = (agentRow.config ?? {}) as Record<string, unknown>;
  // Use agent model, fall back to tenant default, then to Sonnet 4.5
  const tenantModels = await getTenantModelSettings(ctx.tenantId);
  const model =
    (agentConfig.model as string) || tenantModels.defaultModel || "claude-sonnet-4-5-20250929";
  const agentName = (agentConfig.name as string) ?? "Assistant";

  // Check if tools are enabled for this agent (default: true)
  const enableTools = (agentConfig.enableTools as boolean) !== false;

  // Build system prompt with persistent memory
  const basePrompt = (agentConfig.systemPrompt as string) ?? "";
  const agentMemory = (agentConfig.memory as string) ?? "";
  const systemPromptParts: string[] = [];
  const now = new Date();
  systemPromptParts.push(
    `Current date and time: ${now.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}, ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`,
  );
  if (basePrompt) systemPromptParts.push(basePrompt);
  if (agentMemory) {
    systemPromptParts.push(
      `# Persistent Memory\nThe following is your persistent memory from previous conversations. Use it to maintain context and recall important information.\n\n${agentMemory}`,
    );
  }
  if (enableTools) {
    systemPromptParts.push(
      `# Tools & Capabilities
You have access to powerful tools that allow you to take real actions. Use them proactively — do not say you "cannot" do something if a tool can accomplish it. Your tools include:
- **Bash**: Execute shell commands, including \`curl\` for calling any API (public or authenticated with keys/tokens).
- **WebFetch**: Fetch any URL and process the response. Use this to call REST APIs, scrape web pages, and retrieve data.
- **WebSearch**: Search the web for current information.
- **Read/Write/Edit/Glob/Grep**: Full filesystem access for reading, writing, searching, and editing files.
- **UpdateMemory**: Save important information to your persistent memory for future conversations.

When a user asks if you can connect to an API, access a service, or fetch data — the answer is YES. Use WebFetch for simple GET requests, or Bash with curl for more complex API calls (POST, headers, authentication). Always try to fulfill the request using your tools rather than explaining limitations.`,
    );
  }

  // Artifact instructions for canvas rendering
  systemPromptParts.push(
    `# Artifacts
When you create substantial content (more than 15 lines of code, HTML pages, SVG graphics, diagrams, or documents), wrap it in artifact tags so it renders in an interactive preview panel.

## Syntax
\`\`\`
<artifact type="TYPE" title="TITLE" language="LANG">
CONTENT
</artifact>
\`\`\`

## Supported Types
| Type | Use for | language attr |
|------|---------|---------------|
| \`html\` | Full HTML pages, landing pages, interactive widgets | not needed |
| \`code\` | Code snippets, scripts, config files | e.g. "typescript", "python" |
| \`svg\` | SVG graphics and illustrations | not needed |
| \`mermaid\` | Diagrams (flowcharts, sequence, ER, etc.) | not needed |
| \`markdown-document\` | Long-form documents, READMEs, specs | not needed |
| \`react-component\` | Interactive React components with JSX | not needed |

## Rules
- Use artifacts for content >15 lines or visual/interactive content
- Short code snippets (< 15 lines) should stay inline in markdown code blocks
- The \`title\` attribute is required and should be descriptive
- To **update** an existing artifact, use the SAME title — the system will create a new version automatically
- For \`html\` type: include complete, self-contained HTML with inline CSS/JS. Use Tailwind via CDN if desired
- For \`react-component\` type: export a default functional component. Tailwind is available
- For \`mermaid\` type: use standard Mermaid syntax (graph TD, sequenceDiagram, etc.)
- You can include multiple artifacts in one message
- Always explain what you created outside the artifact tags`,
  );

  // systemPrompt computed after project instructions are loaded (below)

  // 2. Create or load session
  let session;
  if (sessionId) {
    session = await getSessionById(ctx.tenantId, sessionId);
    if (!session || session.userId !== ctx.userId) {
      return notFound(c, "Session");
    }
  } else {
    // Auto-generate title from first message
    const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
    session = await createSession(ctx.tenantId, {
      userId: ctx.userId,
      agentId,
      sessionKey: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionData: { title },
    });
    sessionId = session.id;
  }

  // 3. Save user message in transcript
  const existingTranscript = await getTranscript(ctx.tenantId, sessionId!, {
    limit: 500,
  });
  const nextSeq = existingTranscript.length + 1;

  await appendTranscriptEntry(sessionId!, ctx.tenantId, {
    seqNum: nextSeq,
    entryType: "message",
    role: "user",
    content: message,
  });

  // 4. Build message array for LLM
  const llmMessages: LlmMessage[] = [];

  // Add existing history
  for (const entry of existingTranscript) {
    if (entry.role === "user" || entry.role === "assistant") {
      llmMessages.push({
        role: entry.role,
        content: entry.content ?? "",
      });
    }
  }

  // Add new user message
  llmMessages.push({ role: "user", content: message });

  // Process file attachments into multimodal content blocks
  if (parsed.data.files?.length) {
    const contentBlocks: Array<{
      type: string;
      text?: string;
      source?: { type: string; media_type: string; data: string };
    }> = [{ type: "text", text: message }];
    for (const file of parsed.data.files) {
      const block = await processFileForLlm(file.path, file.mimeType);
      contentBlocks.push(block);
    }
    // Replace last message with multimodal content
    llmMessages[llmMessages.length - 1] = {
      role: "user",
      content: contentBlocks as any,
    };
  }

  // 5. Stream response via SSE
  const provider = getLlmProvider(model, tenantModels.anthropicApiKey);

  // Per-session workspace for tool file operations
  const workspacePath = `/tmp/cerebro-workspaces/${sessionId}`;

  // Load project instructions (needs workspacePath)
  const projectInstructions = await loadProjectInstructions(
    workspacePath,
    agentConfig.projectInstructions as string | undefined,
    {
      agentName: agentName,
      userName: ctx.userId,
      date: new Date().toISOString().split("T")[0],
      tenantId: ctx.tenantId,
    },
  );
  if (projectInstructions) {
    // Insert between base prompt and memory
    systemPromptParts.splice(1, 0, `# Project Instructions\n${projectInstructions}`);
  }

  // Now compute final system prompt (after project instructions)
  const systemPrompt = systemPromptParts.length > 0 ? systemPromptParts.join("\n\n") : undefined;

  // Load MCP servers from agent config
  let mcpManager:
    | InstanceType<typeof import("../../services/mcp/client.js").McpClientManager>
    | undefined;
  const mcpServers =
    (agentConfig.mcpServers as import("../../services/mcp/client.js").McpServerConfig[]) ?? [];
  if (mcpServers.length > 0) {
    const { McpClientManager } = await import("../../services/mcp/client.js");
    mcpManager = new McpClientManager();
    for (const server of mcpServers) {
      try {
        await mcpManager.connect(server);
      } catch {
        /* skip failed servers */
      }
    }
  }

  // Load hooks engine from agent config
  let hookEngine: any = undefined;
  const hooks = (agentConfig.hooks as any[]) ?? [];
  if (hooks.length > 0) {
    const { HookEngine } = await import("../../services/hooks/engine.js");
    hookEngine = new HookEngine(hooks);
  }

  const abortController = new AbortController();
  const approvalPolicy = new SessionApprovalPolicy();
  // Skip tool approval if configured on the agent (like --dangerously-skip-approval)
  if ((agentConfig.skipToolApproval as boolean) === true) {
    approvalPolicy.setSkipAll(true);
  }
  activeApprovalPolicies.set(sessionId!, approvalPolicy);

  return streamSSE(c, async (stream) => {
    // Detect client disconnect
    stream.onAbort(() => {
      abortController.abort();
    });

    let fullResponse = "";
    let usageData = { inputTokens: 0, outputTokens: 0 };

    try {
      const gen = provider.streamChat(
        {
          model,
          systemPrompt,
          maxTokens: (agentConfig.parameters as Record<string, unknown>)?.maxTokens as
            | number
            | undefined,
          temperature: (agentConfig.parameters as Record<string, unknown>)?.temperature as
            | number
            | undefined,
          enableTools,
          workspacePath,
          agentId,
          tenantId: ctx.tenantId,
          sessionId: sessionId!,
          signal: abortController.signal,
          approvalPolicy,
          mcpManager,
          hookEngine,
        },
        llmMessages,
      );

      for await (const chunk of gen) {
        switch (chunk.type) {
          case "text_delta":
            fullResponse += chunk.text ?? "";
            await stream.writeSSE({
              data: JSON.stringify({
                type: "text",
                content: chunk.text ?? "",
              }),
            });
            break;

          case "thinking":
            await stream.writeSSE({
              data: JSON.stringify({
                type: "thinking",
                content: chunk.thinking ?? "",
              }),
            });
            break;

          case "tool_use":
            await stream.writeSSE({
              data: JSON.stringify({
                type: "tool_use",
                id: chunk.toolUse?.id,
                name: chunk.toolUse?.name,
                input: chunk.toolUse?.input,
              }),
            });
            break;

          case "tool_result":
            // Check if this was a handoff
            if (chunk.toolResult?.name === "HandoffToAgent" && !chunk.toolResult?.isError) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "agent_switch",
                  message: chunk.toolResult.output,
                }),
              });
            }
            await stream.writeSSE({
              data: JSON.stringify({
                type: "tool_result",
                id: chunk.toolResult?.id,
                name: chunk.toolResult?.name,
                // Truncate output for SSE to prevent massive payloads
                output: (chunk.toolResult?.output ?? "").slice(0, 10000),
                isError: chunk.toolResult?.isError,
              }),
            });
            break;

          case "tool_stream":
            await stream.writeSSE({
              data: JSON.stringify({
                type: "tool_stream",
                id: chunk.toolStream?.id,
                name: chunk.toolStream?.name,
                chunk: chunk.toolStream?.chunk,
                stream: chunk.toolStream?.stream,
              }),
            });
            break;

          case "tool_permission_request":
            await stream.writeSSE({
              data: JSON.stringify({
                type: "tool_permission_request",
                id: chunk.permissionRequest?.id,
                toolName: chunk.permissionRequest?.toolName,
                toolInput: chunk.permissionRequest?.toolInput,
                riskLevel: chunk.permissionRequest?.riskLevel,
              }),
            });
            break;

          case "usage":
            if (chunk.usage) {
              usageData = chunk.usage;
            }
            break;

          case "error":
            await stream.writeSSE({
              data: JSON.stringify({
                type: "error",
                error: chunk.error ?? "Unknown error",
              }),
            });
            break;
        }
      }

      // Skip normal save if aborted — save partial response instead
      if (abortController.signal.aborted) {
        if (fullResponse) {
          await appendTranscriptEntry(sessionId!, ctx.tenantId, {
            seqNum: nextSeq + 1,
            entryType: "message",
            role: "assistant",
            content: fullResponse + "\n\n(Cancelled)",
            tokensIn: usageData.inputTokens,
            tokensOut: usageData.outputTokens,
          });
        }
        await stream.writeSSE({
          data: JSON.stringify({ type: "done", sessionId, cancelled: true }),
        });
        return;
      }

      // 6. Save assistant response
      await appendTranscriptEntry(sessionId!, ctx.tenantId, {
        seqNum: nextSeq + 1,
        entryType: "message",
        role: "assistant",
        content: fullResponse,
        tokensIn: usageData.inputTokens,
        tokensOut: usageData.outputTokens,
      });

      // 7. Record usage
      const costUsd = calculateCost(model, usageData.inputTokens, usageData.outputTokens);

      await recordUsage({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        agentId,
        sessionKey: session.sessionKey,
        modelProvider: getModelProvider(model),
        modelId: model,
        tokensInput: usageData.inputTokens,
        tokensOutput: usageData.outputTokens,
        costUsd,
      });

      // 8. Audit log
      try {
        await getAuditLogger().logAdminAction(
          ctx.tenantId,
          ctx.userId,
          "agent.chat.message_sent",
          "session",
          sessionId!,
          {
            agentId,
            model,
            tokensIn: usageData.inputTokens,
            tokensOut: usageData.outputTokens,
            costUsd,
          },
        );
      } catch {
        // Best effort - don't break chat for audit failures
      }

      // 9. Send done event
      await stream.writeSSE({
        data: JSON.stringify({
          type: "done",
          sessionId,
          usage: {
            inputTokens: usageData.inputTokens,
            outputTokens: usageData.outputTokens,
            costUsd,
          },
        }),
      });
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          error: err instanceof Error ? err.message : "Stream failed",
        }),
      });
    } finally {
      approvalPolicy.cleanup();
      activeApprovalPolicies.delete(sessionId!);
      if (mcpManager) {
        mcpManager.disconnectAll().catch(() => {});
      }
    }
  });
});

/** POST /chat/approve - Approve or deny a pending tool execution */
chat.post("/approve", requirePermission("agent:chat"), async (c) => {
  const { sessionId, approvalId, approved, alwaysAllow } = await c.req.json();

  const policy = activeApprovalPolicies.get(sessionId);
  if (!policy) {
    return c.json({ error: "No active session" }, 404);
  }

  const resolved = policy.resolveApproval(approvalId, approved ?? false, alwaysAllow ?? false);
  return c.json({ ok: resolved });
});

export { chat };
export const chatRoutes = chat;
