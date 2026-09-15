export type AiModelPrice = {
  inputPer1M: number;
  outputPer1M: number;
};

const MODEL_PRICES: Record<string, AiModelPrice> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-5.6-luna": { inputPer1M: 0.2, outputPer1M: 1.2 },
  "gpt-5.4-mini": { inputPer1M: 0.75, outputPer1M: 4.5 },
  "gpt-5.4-mini-2026-03-17": { inputPer1M: 0.75, outputPer1M: 4.5 }
};

const DEFAULT_PRICE: AiModelPrice = { inputPer1M: 0.15, outputPer1M: 0.6 };

export function resolveAiModelPrice(model: string): AiModelPrice {
  const key = model.trim().toLowerCase();
  return MODEL_PRICES[key] ?? DEFAULT_PRICE;
}

export function estimateAiCostUsd(input: {
  model: string;
  tokensInput: number;
  tokensOutput: number;
}): number {
  const price = resolveAiModelPrice(input.model);
  return (input.tokensInput / 1_000_000) * price.inputPer1M + (input.tokensOutput / 1_000_000) * price.outputPer1M;
}

export function isReasoningModel(model: string): boolean {
  const key = model.trim().toLowerCase();
  return key.startsWith("gpt-5") || /^o[1-9]/.test(key) || key.startsWith("o4");
}
