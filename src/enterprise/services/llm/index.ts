import type { LlmProvider } from "./provider.js";
import { AnthropicProvider } from "./anthropic.js";

export type { LlmProvider, LlmProviderConfig, LlmMessage, LlmStreamChunk } from "./provider.js";
export { calculateCost, getModelProvider } from "./cost.js";

const providerCache = new Map<string, AnthropicProvider>();

export function getLlmProvider(model: string, apiKey?: string): LlmProvider {
  if (model.startsWith("claude")) {
    const cacheKey = apiKey ?? "__env__";
    let provider = providerCache.get(cacheKey);
    if (!provider) {
      provider = new AnthropicProvider(apiKey);
      providerCache.set(cacheKey, provider);
    }
    return provider;
  }

  throw new Error(`No LLM provider available for model: ${model}`);
}
