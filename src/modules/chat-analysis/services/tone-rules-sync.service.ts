import type { ToneAnalysisAiResult } from "../types/tone-analysis-result.type.js";
import type {
  GreetingConfig,
  SuggestedGreeting
} from "../types/greeting-config.type.js";
import { DEFAULT_GREETING_CONFIG } from "../types/greeting-config.type.js";

function emojiUsageToBoolean(usage: string | null | undefined): boolean {
  return usage !== "none" && usage !== "low";
}

function inferOfferNextStep(result: ToneAnalysisAiResult): boolean {
  const rules = result.recommended_bot_rules ?? {};
  if (typeof rules.offer_next_step === "boolean") return rules.offer_next_step;
  const sales = (result.sales_style ?? "").toLowerCase();
  return /agendar|agenda|reserv|cotiz|siguiente|escrib|contact/.test(sales);
}

function inferAvoidLong(result: ToneAnalysisAiResult): boolean {
  const rules = result.recommended_bot_rules ?? {};
  if (typeof rules.avoid_long_explanations === "boolean") {
    return rules.avoid_long_explanations;
  }
  return result.response_length === "short";
}

export function syncRecommendedBotRules(
  result: ToneAnalysisAiResult,
  extras?: {
    suggested_greetings?: SuggestedGreeting[];
    filler_words?: string[];
    greeting_config?: Partial<GreetingConfig>;
  }
): ToneAnalysisAiResult["recommended_bot_rules"] {
  const base = result.recommended_bot_rules ?? {};
  const useEmojis =
    typeof base.use_emojis === "boolean"
      ? base.use_emojis
      : emojiUsageToBoolean(result.emoji_usage);

  const responseLength =
    (typeof base.response_length === "string" && base.response_length) ||
    result.response_length ||
    "medium";

  const synced: ToneAnalysisAiResult["recommended_bot_rules"] = {
    ...base,
    use_emojis: useEmojis,
    response_length: responseLength,
    offer_next_step: inferOfferNextStep(result),
    avoid_long_explanations: inferAvoidLong(result),
    greeting_config: {
      ...DEFAULT_GREETING_CONFIG,
      ...(typeof base.greeting_config === "object" && base.greeting_config
        ? (base.greeting_config as GreetingConfig)
        : {}),
      ...extras?.greeting_config
    }
  };

  if (extras?.suggested_greetings) {
    synced.suggested_greetings = extras.suggested_greetings;
  } else if (base.suggested_greetings) {
    synced.suggested_greetings = base.suggested_greetings as SuggestedGreeting[];
  }

  if (extras?.filler_words) {
    synced.filler_words = extras.filler_words;
  } else if (base.filler_words) {
    synced.filler_words = base.filler_words as string[];
  }

  return synced;
}

export function mergeSuggestedGreetings(
  lists: SuggestedGreeting[][]
): SuggestedGreeting[] {
  const map = new Map<string, SuggestedGreeting>();
  for (const list of lists) {
    for (const greeting of list) {
      const key = greeting.text.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...greeting });
        continue;
      }
      existing.usage_count = (existing.usage_count ?? 0) + (greeting.usage_count ?? 1);
      if (!existing.source.includes(greeting.source)) {
        existing.source = `${existing.source}, ${greeting.source}`;
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))
    .slice(0, 12);
}

export function mergeFillerWords(lists: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const word of list) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 15);
}
