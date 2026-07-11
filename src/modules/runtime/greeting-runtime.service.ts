import type {
  GreetingConfig,
  GreetingWarmth,
  SuggestedGreeting
} from "../chat-analysis/types/greeting-config.type.js";
import { DEFAULT_GREETING_CONFIG } from "../chat-analysis/types/greeting-config.type.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseToneGreetings(configJson: unknown): SuggestedGreeting[] {
  const record = asRecord(configJson);
  const raw = record.toneGreetings ?? asRecord(record.toneRules).suggested_greetings;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const greeting: SuggestedGreeting = {
        text: String(item.text ?? "").trim(),
        warmth: (["formal", "neutral", "warm"].includes(String(item.warmth))
          ? item.warmth
          : "neutral") as GreetingWarmth,
        source: String(item.source ?? "chat")
      };
      if (typeof item.usage_count === "number") {
        greeting.usage_count = item.usage_count;
      }
      return greeting;
    })
    .filter((item) => item.text.length > 0);
}

export function parseToneGreetingConfig(configJson: unknown): GreetingConfig {
  const record = asRecord(configJson);
  const raw =
    record.toneGreetingConfig ?? asRecord(record.toneRules).greeting_config;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_GREETING_CONFIG;
  }
  const cfg = raw as Record<string, unknown>;
  return {
    new_customer_warmth:
      cfg.new_customer_warmth === "formal" ||
      cfg.new_customer_warmth === "warm" ||
      cfg.new_customer_warmth === "neutral"
        ? cfg.new_customer_warmth
        : DEFAULT_GREETING_CONFIG.new_customer_warmth,
    returning_customer_warmth:
      cfg.returning_customer_warmth === "formal" ||
      cfg.returning_customer_warmth === "warm" ||
      cfg.returning_customer_warmth === "neutral"
        ? cfg.returning_customer_warmth
        : DEFAULT_GREETING_CONFIG.returning_customer_warmth,
    returning_min_messages:
      typeof cfg.returning_min_messages === "number" && cfg.returning_min_messages > 0
        ? cfg.returning_min_messages
        : DEFAULT_GREETING_CONFIG.returning_min_messages,
    combine_greeting_with_answers:
      typeof cfg.combine_greeting_with_answers === "boolean"
        ? cfg.combine_greeting_with_answers
        : DEFAULT_GREETING_CONFIG.combine_greeting_with_answers
  };
}

export function resolveCustomerWarmth(
  priorInboundCount: number,
  config: GreetingConfig
): GreetingWarmth {
  return priorInboundCount >= config.returning_min_messages
    ? config.returning_customer_warmth
    : config.new_customer_warmth;
}

export function pickGreetingForWarmth(
  greetings: SuggestedGreeting[],
  warmth: GreetingWarmth,
  fallback: string
): string {
  if (!greetings.length) return fallback;

  const exact = greetings.filter((g) => g.warmth === warmth);
  const pool = exact.length ? exact : greetings;
  const sorted = [...pool].sort(
    (a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0)
  );
  return sorted[0]?.text ?? fallback;
}

export function buildGreetingStyleHint(input: {
  greeting: string;
  combineWithAnswers: boolean;
  isHybridMessage: boolean;
}): string {
  if (!input.isHybridMessage && !input.combineWithAnswers) {
    return `Si solo saludan, responde con un saludo similar a: "${input.greeting}".`;
  }
  if (input.isHybridMessage || input.combineWithAnswers) {
    return `Si el mensaje mezcla saludo con una consulta, abre con un saludo natural como "${input.greeting}" y luego responde la consulta con la información del contexto en el mismo mensaje. No respondas solo el saludo si también preguntan algo.`;
  }
  return "";
}
