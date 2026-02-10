import type { IChannelAdapter, ChannelTestResult } from "../channel-adapter.js";

export class WebhookAdapter implements IChannelAdapter {
  validateConfig(config: Record<string, unknown>): boolean {
    const url = config.url ?? config.webhookUrl;
    if (typeof url !== "string" || !url.trim()) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  async testConnection(config: Record<string, unknown>): Promise<ChannelTestResult> {
    const url = (config.url ?? config.webhookUrl) as string | undefined;

    if (!this.validateConfig(config)) {
      return {
        success: false,
        message: "Invalid or missing webhook URL in channel config",
        latencyMs: 0,
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(url!, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;

      if (response.ok || response.status === 405) {
        // 405 means HEAD not allowed but endpoint exists -- try GET fallback
        if (response.status === 405) {
          const start2 = Date.now();
          const getResponse = await fetch(url!, {
            method: "GET",
            signal: AbortSignal.timeout(10_000),
          });
          const latencyMs2 = Date.now() - start2;
          return {
            success: getResponse.ok,
            message: getResponse.ok
              ? "Webhook endpoint reachable"
              : `Webhook returned HTTP ${getResponse.status}`,
            latencyMs: latencyMs2,
            details: { httpStatus: getResponse.status, method: "GET" },
          };
        }

        return {
          success: true,
          message: "Webhook endpoint reachable",
          latencyMs,
          details: { httpStatus: response.status, method: "HEAD" },
        };
      }

      return {
        success: false,
        message: `Webhook returned HTTP ${response.status}`,
        latencyMs,
        details: { httpStatus: response.status },
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Webhook connectivity failed: ${errorMessage}`,
        latencyMs,
      };
    }
  }
}
