// ---------------------------------------------------------------------------
// Channel Adapter Interface & Types
// ---------------------------------------------------------------------------

export type ChannelTestResult = {
  success: boolean;
  message: string;
  latencyMs: number;
  details?: Record<string, unknown>;
};

export interface IncomingMessage {
  externalId: string;
  senderId: string;
  senderName: string;
  text: string;
  platform: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

export interface IChannelAdapter {
  testConnection(config: Record<string, unknown>): Promise<ChannelTestResult>;
  validateConfig(config: Record<string, unknown>): boolean;
  parseIncomingMessage?(body: unknown, headers: Record<string, string>): IncomingMessage | null;
  sendMessage?(
    config: Record<string, unknown>,
    recipientId: string,
    text: string,
  ): Promise<boolean>;
  verifyWebhook?(body: unknown, headers: Record<string, string>, secret: string): boolean;
}
