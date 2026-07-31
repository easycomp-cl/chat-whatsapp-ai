import type { GreetingWarmth } from "../chat-analysis/types/greeting-config.type.js";
import type {
  ConversationalConfig,
  ConversationalResponseSet,
  ConversationalTrigger,
  ResponseVariant
} from "./types/conversational-response.type.js";
import {
  DEFAULT_CONVERSATIONAL_CONFIG,
  DEFAULT_CONVERSATIONAL_REPLIES
} from "./types/conversational-response.type.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseVariant(item: unknown): ResponseVariant | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const text = String(record.text ?? "").trim();
  if (!text) return null;

  const variant: ResponseVariant = { text };
  if (
    record.warmth === "formal" ||
    record.warmth === "neutral" ||
    record.warmth === "warm"
  ) {
    variant.warmth = record.warmth;
  }
  if (typeof record.weight === "number" && record.weight > 0) {
    variant.weight = record.weight;
  }
  return variant;
}

function parseResponseSet(item: unknown): ConversationalResponseSet | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const trigger = record.trigger;
  const validTriggers: ConversationalTrigger[] = [
    "greeting_pure",
    "greeting_returning",
    "thanks",
    "ack",
    "soft_fallback"
  ];
  if (!validTriggers.includes(trigger as ConversationalTrigger)) return null;

  const variants = Array.isArray(record.variants)
    ? record.variants.map(parseVariant).filter((v): v is ResponseVariant => v !== null)
    : [];

  const selection = record.selection;
  const validSelection =
    selection === "random" || selection === "round_robin" || selection === "by_warmth"
      ? selection
      : "random";

  return {
    trigger: trigger as ConversationalTrigger,
    variants,
    selection: validSelection,
    enabled: record.enabled !== false
  };
}

export function parseConversationalConfig(configJson: unknown): ConversationalConfig {
  const record = asRecord(configJson);
  const raw =
    record.conversationalResponses ??
    asRecord(record.conversationalConfig).responses;

  if (!Array.isArray(raw)) {
    return {
      ...DEFAULT_CONVERSATIONAL_CONFIG,
      handoff_on_low_confidence:
        record.handoff_on_low_confidence === true ||
        asRecord(record.conversationalConfig).handoff_on_low_confidence === true
    };
  }

  const responses = raw
    .map(parseResponseSet)
    .filter((set): set is ConversationalResponseSet => set !== null);

  const handoffFlag =
    record.handoff_on_low_confidence ??
    asRecord(record.conversationalConfig).handoff_on_low_confidence;

  return {
    responses,
    handoff_on_low_confidence: handoffFlag === true
  };
}

export function applyConversationalPlaceholders(
  text: string,
  placeholders: {
    nombre?: string;
    negocio: string;
    bot: string;
    saludo: string;
  }
): string {
  return text
    .replace(/\{nombre\}/gi, placeholders.nombre ?? "")
    .replace(/\{negocio\}/gi, placeholders.negocio)
    .replace(/\{bot\}/gi, placeholders.bot)
    .replace(/\{saludo\}/gi, placeholders.saludo)
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickByWarmth(variants: ResponseVariant[], warmth: GreetingWarmth): ResponseVariant | null {
  const exact = variants.filter((v) => v.warmth === warmth);
  if (exact.length) return exact[0] ?? null;
  const neutral = variants.filter((v) => v.warmth === "neutral");
  if (neutral.length) return neutral[0] ?? null;
  return variants[0] ?? null;
}

function pickByRandom(variants: ResponseVariant[]): ResponseVariant | null {
  if (!variants.length) return null;
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  let roll = Math.random() * totalWeight;
  for (const variant of variants) {
    roll -= variant.weight ?? 1;
    if (roll <= 0) return variant;
  }
  return variants[variants.length - 1] ?? null;
}

function pickByRoundRobin(
  variants: ResponseVariant[],
  conversationId: string
): ResponseVariant | null {
  if (!variants.length) return null;
  const index = hashString(conversationId) % variants.length;
  return variants[index] ?? null;
}

function pickVariant(
  set: ConversationalResponseSet,
  warmth: GreetingWarmth,
  conversationId: string
): ResponseVariant | null {
  if (!set.enabled || !set.variants.length) return null;

  switch (set.selection) {
    case "by_warmth":
      return pickByWarmth(set.variants, warmth);
    case "round_robin":
      return pickByRoundRobin(set.variants, conversationId);
    case "random":
    default:
      return pickByRandom(set.variants);
  }
}

export function pickConversationalResponse(input: {
  trigger: ConversationalTrigger;
  config: ConversationalConfig;
  warmth: GreetingWarmth;
  conversationId: string;
  placeholders: {
    nombre?: string;
    negocio: string;
    bot: string;
    saludo: string;
  };
  fallbackMessage?: string;
}): string | null {
  const set = input.config.responses.find(
    (item) => item.trigger === input.trigger && item.enabled
  );
  const variant = set ? pickVariant(set, input.warmth, input.conversationId) : null;

  if (variant) {
    return applyConversationalPlaceholders(variant.text, input.placeholders);
  }

  if (input.trigger === "soft_fallback") {
    const fallback =
      input.fallbackMessage?.trim() ||
      "No tengo esa información confirmada todavía. ¿Te ayudo con algo más?";
    return applyConversationalPlaceholders(fallback, input.placeholders);
  }

  if (input.trigger === "greeting_returning") {
    return pickConversationalResponse({
      ...input,
      trigger: "greeting_pure"
    });
  }

  const defaultTemplate =
    DEFAULT_CONVERSATIONAL_REPLIES[
      input.trigger as keyof typeof DEFAULT_CONVERSATIONAL_REPLIES
    ];
  if (!defaultTemplate) return null;

  return applyConversationalPlaceholders(defaultTemplate, input.placeholders);
}
