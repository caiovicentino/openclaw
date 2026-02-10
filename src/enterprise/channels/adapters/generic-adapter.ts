import type { IChannelAdapter, ChannelTestResult } from "../channel-adapter.js";

export class GenericAdapter implements IChannelAdapter {
  validateConfig(config: Record<string, unknown>): boolean {
    return config !== null && typeof config === "object" && Object.keys(config).length > 0;
  }

  async testConnection(config: Record<string, unknown>): Promise<ChannelTestResult> {
    const start = Date.now();
    const valid = this.validateConfig(config);
    const latencyMs = Date.now() - start;

    if (!valid) {
      return {
        success: false,
        message: "Channel config is empty or invalid",
        latencyMs,
      };
    }

    return {
      success: true,
      message: "Channel config structure is valid",
      latencyMs,
      details: { configKeys: Object.keys(config) },
    };
  }
}
