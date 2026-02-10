import type { IChannelAdapter } from "./channel-adapter.js";
import { GenericAdapter } from "./adapters/generic-adapter.js";
import { SlackAdapter } from "./adapters/slack-adapter.js";
import { TelegramAdapter } from "./adapters/telegram-adapter.js";
import { WebhookAdapter } from "./adapters/webhook-adapter.js";
import { WhatsAppAdapter } from "./adapters/whatsapp-adapter.js";
import { WhatsAppWebAdapter } from "./adapters/whatsapp-web-adapter.js";

const adapters: Record<string, IChannelAdapter> = {
  webhook: new WebhookAdapter(),
  slack: new SlackAdapter(),
  telegram: new TelegramAdapter(),
  whatsapp: new WhatsAppAdapter(),
  "whatsapp-web": new WhatsAppWebAdapter(),
};

const fallback = new GenericAdapter();

export function getAdapter(channelType: string): IChannelAdapter {
  return adapters[channelType] ?? fallback;
}
