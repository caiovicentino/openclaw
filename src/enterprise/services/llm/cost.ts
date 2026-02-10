// ---------------------------------------------------------------------------
// Model pricing lookup (USD per 1M tokens)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-5-20250514": { inputPer1M: 3, outputPer1M: 15 },
  "claude-opus-4-20250514": { inputPer1M: 15, outputPer1M: 75 },
  "claude-haiku-3-5-20241022": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-3-opus-20240229": { inputPer1M: 15, outputPer1M: 75 },
  "claude-3-sonnet-20240229": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-haiku-20240307": { inputPer1M: 0.25, outputPer1M: 1.25 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 3, outputPer1M: 15 };

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] ?? matchPartialModel(model) ?? DEFAULT_PRICING;
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

function matchPartialModel(model: string): ModelPricing | null {
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.startsWith(key.split("-").slice(0, 3).join("-"))) {
      return pricing;
    }
  }
  return null;
}

export function getModelProvider(model: string): string {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt")) return "openai";
  return "unknown";
}
