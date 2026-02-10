import type { IChannelAdapter, ChannelTestResult, IncomingMessage } from "../channel-adapter.js";

export class WhatsAppAdapter implements IChannelAdapter {
  validateConfig(config: Record<string, unknown>): boolean {
    return (
      typeof config.accessToken === "string" &&
      config.accessToken.length > 0 &&
      typeof config.phoneNumberId === "string" &&
      config.phoneNumberId.length > 0
    );
  }

  async testConnection(config: Record<string, unknown>): Promise<ChannelTestResult> {
    const accessToken = config.accessToken as string;
    const phoneNumberId = config.phoneNumberId as string;
    const start = Date.now();
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        const data = (await res.json()) as { display_phone_number?: string };
        return {
          success: true,
          message: `Connected to ${data.display_phone_number ?? phoneNumberId}`,
          latencyMs,
        };
      }
      return {
        success: false,
        message: `WhatsApp API returned HTTP ${res.status}`,
        latencyMs,
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
    const payload = body as Record<string, unknown>;
    const entry = (payload?.entry as unknown[]) ?? [];
    const firstEntry = entry[0] as Record<string, unknown> | undefined;
    if (!firstEntry) return null;

    const changes = (firstEntry.changes as unknown[]) ?? [];
    const firstChange = changes[0] as Record<string, unknown> | undefined;
    const value = firstChange?.value as Record<string, unknown> | undefined;
    if (!value) return null;

    const messages = (value.messages as unknown[]) ?? [];
    const msg = messages[0] as Record<string, unknown> | undefined;
    if (!msg || msg.type !== "text") return null;

    const textObj = msg.text as Record<string, unknown> | undefined;
    const contacts = (value.contacts as unknown[]) ?? [];
    const contact = contacts[0] as Record<string, unknown> | undefined;
    const profile = contact?.profile as Record<string, unknown> | undefined;

    return {
      externalId: (msg.id as string) ?? "",
      senderId: (msg.from as string) ?? "",
      senderName: (profile?.name as string) ?? "User",
      text: (textObj?.body as string) ?? "",
      platform: "whatsapp",
      metadata: { waId: msg.from },
    };
  }

  async sendMessage(
    config: Record<string, unknown>,
    recipientId: string,
    text: string,
  ): Promise<boolean> {
    const accessToken = config.accessToken as string;
    const phoneNumberId = config.phoneNumberId as string;
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientId,
        type: "text",
        text: { body: text },
      }),
    });
    return res.ok;
  }
}
