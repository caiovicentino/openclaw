import type { LlmMessage } from "../llm/provider.js";
import { query } from "../../db/connection.js";
import { getLlmProvider } from "../llm/index.js";
import { getTenantModelSettings } from "../llm/tenant-settings.js";

export async function handoffSession(
  tenantId: string,
  sessionId: string,
  targetAgentId: string,
  contextSummary: string,
): Promise<{ success: boolean; agentName: string }> {
  // Load target agent
  const agentResult = await query(
    "SELECT config FROM agent_configs WHERE id = $1 AND tenant_id = $2",
    [targetAgentId, tenantId],
  );
  if (agentResult.rows.length === 0) {
    return { success: false, agentName: "Unknown" };
  }

  const config = (agentResult.rows[0].config ?? {}) as Record<string, unknown>;
  const agentName = (config.name as string) ?? "Agent";

  // Update session
  await query(
    `UPDATE sessions SET
     current_agent_id = $1,
     session_data = jsonb_set(
       COALESCE(session_data, '{}')::jsonb,
       '{agent_chain}',
       COALESCE(session_data->'agent_chain', '[]')::jsonb || $2::jsonb
     ),
     updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [
      targetAgentId,
      JSON.stringify([
        {
          agentId: targetAgentId,
          timestamp: new Date().toISOString(),
          context: contextSummary,
        },
      ]),
      sessionId,
      tenantId,
    ],
  );

  return { success: true, agentName };
}

export async function invokeSubAgent(
  tenantId: string,
  targetAgentId: string,
  task: string,
): Promise<string> {
  // Load target agent config
  const agentResult = await query(
    "SELECT config FROM agent_configs WHERE id = $1 AND tenant_id = $2",
    [targetAgentId, tenantId],
  );
  if (agentResult.rows.length === 0) {
    return "Error: Target agent not found";
  }

  const agentConfig = (agentResult.rows[0].config ?? {}) as Record<string, unknown>;
  const tenantModels = await getTenantModelSettings(tenantId);
  const model =
    (agentConfig.model as string) || tenantModels.defaultModel || "claude-sonnet-4-5-20250929";
  const systemPrompt = (agentConfig.systemPrompt as string) ?? "";

  // Run a single-turn conversation with the sub-agent (no tools to keep it simple)
  const provider = getLlmProvider(model, tenantModels.anthropicApiKey);
  const messages: LlmMessage[] = [{ role: "user", content: task }];

  let response = "";
  for await (const chunk of provider.streamChat(
    { model, systemPrompt, enableTools: false },
    messages,
  )) {
    if (chunk.type === "text_delta" && chunk.text) {
      response += chunk.text;
    }
  }

  return response || "(No response from sub-agent)";
}
