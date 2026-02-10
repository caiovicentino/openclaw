import type { IChannelAdapter, ChannelTestResult, IncomingMessage } from "../channel-adapter.js";

export class TelegramAdapter implements IChannelAdapter {
  validateConfig(config: Record<string, unknown>): boolean {
    return typeof config.botToken === "string" && config.botToken.length > 0;
  }

  async testConnection(config: Record<string, unknown>): Promise<ChannelTestResult> {
    const token = config.botToken as string;
    const start = Date.now();
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as { ok: boolean; result?: { username: string } };
      return {
        success: data.ok,
        message: data.ok ? `Connected as @${data.result?.username}` : "Invalid token",
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
    }
  }

  parseIncomingMessage(body: unknown): IncomingMessage | null {
    const update = body as Record<string, unknown>;
    const msg = update?.message as Record<string, unknown> | undefined;
    if (!msg?.text) return null;
    const from = msg.from as Record<string, unknown> | undefined;
    const chat = msg.chat as Record<string, unknown> | undefined;
    return {
      externalId: String(msg.message_id),
      senderId: String(from?.id ?? ""),
      senderName: (from?.first_name as string) ?? "User",
      text: msg.text as string,
      platform: "telegram",
      metadata: { chatId: chat?.id },
    };
  }

  async sendMessage(
    config: Record<string, unknown>,
    recipientId: string,
    text: string,
  ): Promise<boolean> {
    const token = config.botToken as string;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: recipientId, text, parse_mode: "Markdown" }),
    });
    return res.ok;
  }
}
