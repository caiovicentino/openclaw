import type { IChannelAdapter, ChannelTestResult } from "../channel-adapter.js";
import { baileysManager } from "../baileys-manager.js";

/**
 * WhatsApp Web adapter — uses Baileys (QR code login) instead of Meta Cloud API.
 *
 * Authentication happens via QR scanning (managed by BaileysManager), so
 * `validateConfig` always returns true and `testConnection` checks the live
 * socket status.  Message sending is delegated to BaileysManager.
 */
export class WhatsAppWebAdapter implements IChannelAdapter {
  validateConfig(_config: Record<string, unknown>): boolean {
    // No manual config needed — auth is via QR scan
    return true;
  }

  async testConnection(config: Record<string, unknown>): Promise<ChannelTestResult> {
    const tenantId = config._tenantId as string | undefined;
    const channelId = config._channelId as string | undefined;

    if (!tenantId || !channelId) {
      return {
        success: false,
        message: "Missing tenant/channel context for connection test",
        latencyMs: 0,
      };
    }

    const start = Date.now();
    const connected = baileysManager.isConnected(tenantId, channelId);

    return {
      success: connected,
      message: connected ? "WhatsApp Web is connected" : "WhatsApp Web is not connected",
      latencyMs: Date.now() - start,
    };
  }

  async sendMessage(
    config: Record<string, unknown>,
    recipientId: string,
    text: string,
  ): Promise<boolean> {
    const tenantId = config._tenantId as string | undefined;
    const channelId = config._channelId as string | undefined;

    if (!tenantId || !channelId) return false;

    // Ensure JID format
    const jid = recipientId.includes("@") ? recipientId : `${recipientId}@s.whatsapp.net`;

    return baileysManager.sendMessage(tenantId, channelId, jid, text);
  }
}
