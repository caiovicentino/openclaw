import { query } from "../../db/connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantModelSettings {
  anthropicApiKey?: string;
  allowedProviders?: string[];
  allowedModels?: Record<string, string[]>;
  defaultModel?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch model-related settings from the tenant's `settings` JSONB column.
 */
export async function getTenantModelSettings(tenantId: string): Promise<TenantModelSettings> {
  const result = await query<{ settings: Record<string, unknown> | null }>(
    `SELECT settings FROM tenants WHERE id = $1`,
    [tenantId],
  );

  const row = result.rows[0];
  if (!row?.settings) return {};

  const s = row.settings;
  return {
    anthropicApiKey: typeof s.anthropicApiKey === "string" ? s.anthropicApiKey : undefined,
    allowedProviders: Array.isArray(s.allowedProviders) ? s.allowedProviders : undefined,
    allowedModels:
      s.allowedModels && typeof s.allowedModels === "object" && !Array.isArray(s.allowedModels)
        ? (s.allowedModels as Record<string, string[]>)
        : undefined,
    defaultModel: typeof s.defaultModel === "string" ? s.defaultModel : undefined,
  };
}

/**
 * Mask an API key for safe display: "sk-ant-api03-abc...xyz" -> "****xyz"
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return "****" + key.slice(-4);
}

/**
 * Returns true if the key is an OAuth token (sk-ant-oat...) rather than a
 * regular API key (sk-ant-api...).
 */
export function isOAuthToken(key: string): boolean {
  return key.startsWith("sk-ant-oat");
}

/**
 * Build the correct Anthropic SDK constructor options depending on whether the
 * credential is a regular API key or an OAuth token.
 *
 * OAuth tokens require specific headers that mimic Claude Code's identity,
 * as Anthropic's Messages API only accepts OAuth tokens with the
 * `claude-code-20250219` and `oauth-2025-04-20` beta flags.
 */
export function buildAnthropicClientOptions(key?: string): {
  apiKey?: string | null;
  authToken?: string;
  defaultHeaders?: Record<string, string>;
  dangerouslyAllowBrowser?: boolean;
} {
  if (!key) return {};
  if (isOAuthToken(key)) {
    return {
      apiKey: null,
      authToken: key,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        accept: "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
        "anthropic-beta":
          "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14",
        "user-agent": "claude-cli/2.1.2 (external, cli)",
        "x-app": "cli",
      },
    };
  }
  return { apiKey: key };
}
