import type { IChannelAdapter, ChannelTestResult, IncomingMessage } from "../channel-adapter.js";

export class SlackAdapter implements IChannelAdapter {
  validateConfig(config: Record<string, unknown>): boolean {
    const token = config.token ?? config.botToken ?? config.accessToken;
    return typeof token === "string" && token.trim().length > 0;
  }

  async testConnection(config: Record<string, unknown>): Promise<ChannelTestResult> {
    const token = (config.token ?? config.botToken ?? config.accessToken) as string | undefined;

    if (!this.validateConfig(config)) {
      return {
        success: false,
        message: "Invalid or missing Slack token in channel config",
        latencyMs: 0,
      };
    }

    const start = Date.now();
    try {
      const response = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        signal: AbortSignal.timeout(10_000),
      });

      const latencyMs = Date.now() - start;
      const body = (await response.json()) as { ok: boolean; team?: string; error?: string };

      if (body.ok) {
        return {
          success: true,
          message: "Slack token is valid",
          latencyMs,
          details: { team: body.team },
        };
      }

      return {
        success: false,
        message: `Slack auth failed: ${body.error ?? "unknown error"}`,
        latencyMs,
        details: { slackError: body.error },
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Slack connectivity failed: ${errorMessage}`,
        latencyMs,
      };
    }
  }

  parseIncomingMessage(body: unknown): IncomingMessage | null {
    const payload = body as Record<string, unknown>;
    const event = payload?.event as Record<string, unknown> | undefined;
    if (!event || event.type !== "message" || event.subtype) return null;
    // Ignore bot messages to avoid loops
    if (event.bot_id) return null;

    return {
      externalId: (event.client_msg_id as string) ?? (event.ts as string) ?? "",
      senderId: (event.user as string) ?? "",
      senderName: (event.user as string) ?? "User",
      text: (event.text as string) ?? "",
      platform: "slack",
      metadata: { channel: event.channel, ts: event.ts },
    };
  }

  async sendMessage(
    config: Record<string, unknown>,
    recipientId: string,
    text: string,
  ): Promise<boolean> {
    const token = (config.token ?? config.botToken ?? config.accessToken) as string;
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: recipientId, text }),
    });
    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  }
}
