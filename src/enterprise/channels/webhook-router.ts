import type { LlmMessage } from "../services/llm/provider.js";
import type { IncomingMessage, IChannelAdapter } from "./channel-adapter.js";
import { query } from "../db/connection.js";
import { logger } from "../lib/logger.js";
import { getLlmProvider } from "../services/llm/index.js";
import { getTenantModelSettings } from "../services/llm/tenant-settings.js";

export async function routeIncomingMessage(
  channelId: string,
  message: IncomingMessage,
  adapter: IChannelAdapter,
  channelConfig: Record<string, unknown>,
): Promise<void> {
  // 1. Look up channel -> agent mapping
  const channelResult = await query(`SELECT * FROM channels WHERE id = $1`, [channelId]);
  if (channelResult.rows.length === 0) return;
  const channel = channelResult.rows[0];
  const tenantId = channel.tenant_id;
  const agentId = channel.agent_id;
  if (!agentId) return;

  // 2. Load agent config
  const agentResult = await query(
    "SELECT config FROM agent_configs WHERE id = $1 AND tenant_id = $2",
    [agentId, tenantId],
  );
  if (agentResult.rows.length === 0) return;
  const agentConfig = (agentResult.rows[0].config ?? {}) as Record<string, unknown>;

  // 3. Get model settings
  const tenantModels = await getTenantModelSettings(tenantId);
  const model =
    (agentConfig.model as string) || tenantModels.defaultModel || "claude-sonnet-4-5-20250929";

  // 4. Build messages (simple single-turn for webhooks)
  const systemPrompt = (agentConfig.systemPrompt as string) ?? "";
  const llmMessages: LlmMessage[] = [{ role: "user", content: message.text }];

  // 5. Non-streaming LLM call
  const provider = getLlmProvider(model, tenantModels.anthropicApiKey);
  let fullResponse = "";

  for await (const chunk of provider.streamChat(
    { model, systemPrompt, enableTools: false },
    llmMessages,
  )) {
    if (chunk.type === "text_delta" && chunk.text) {
      fullResponse += chunk.text;
    }
  }

  // 6. Send response back via adapter
  if (fullResponse && adapter.sendMessage) {
    const recipientId = message.metadata?.chatId
      ? String(message.metadata.chatId)
      : message.senderId;
    await adapter.sendMessage(channelConfig, recipientId, fullResponse);
  }

  // 7. Log the inbound message
  await query(
    `INSERT INTO channel_messages (channel_id, tenant_id, external_id, direction, sender_id, sender_name, content)
     VALUES ($1, $2, $3, 'inbound', $4, $5, $6)`,
    [channelId, tenantId, message.externalId, message.senderId, message.senderName, message.text],
  );

  // 8. Log the outbound response
  if (fullResponse) {
    await query(
      `INSERT INTO channel_messages (channel_id, tenant_id, direction, content)
       VALUES ($1, $2, 'outbound', $3)`,
      [channelId, tenantId, fullResponse],
    );
  }

  logger.info("Webhook message processed", {
    channelId,
    platform: message.platform,
    senderId: message.senderId,
    responseLength: fullResponse.length,
  });
}
