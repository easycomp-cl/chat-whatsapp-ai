import type { GreetingWarmth } from "../modules/chat-analysis/types/greeting-config.type.js";
import type { ConversationalConfig } from "../modules/runtime/types/conversational-response.type.js";
import { pickConversationalResponse } from "../modules/runtime/conversational-response.service.js";
import {
  isGreetingLike,
  isGreetingWithBusinessQuestion,
  isPureGreeting
} from "./greeting-match.js";
import { normalizeForMatch } from "./direct-match.js";

export type ConversationalIntent = "greeting" | "thanks" | "ack";

export { isGreetingLike, isGreetingWithBusinessQuestion };

const THANKS_PATTERNS = [
  /^gracias+$/,
  /^muchas gracias+$/,
  /^mil gracias+$/,
  /^te agradezco$/
];

const ACK_PATTERNS = [
  /^ok$/,
  /^okay$/,
  /^vale$/,
  /^entendido$/,
  /^listo$/,
  /^perfecto$/,
  /^genial$/,
  /^de acuerdo$/,
  /^bien$/,
  /^ya$/,
  /^dale$/
];

export function detectConversationalIntent(text: string): ConversationalIntent | null {
  const normalized = normalizeForMatch(text);
  if (!normalized) {
    return null;
  }

  if (isPureGreeting(text)) {
    return "greeting";
  }
  if (THANKS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "thanks";
  }
  if (ACK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "ack";
  }

  return null;
}

export type ConversationalReplyConfig = {
  greetingMessage: string;
  botName: string;
  businessName: string;
  toneGreeting?: string;
  customerName?: string;
  isReturningCustomer?: boolean;
  conversationId: string;
  conversationalConfig?: ConversationalConfig;
  fallbackMessage?: string;
  warmth?: GreetingWarmth;
};

export function buildConversationalReply(
  intent: ConversationalIntent,
  config: ConversationalReplyConfig
): string {
  const saludo = config.toneGreeting ?? config.greetingMessage;
  const placeholders: {
    nombre?: string;
    negocio: string;
    bot: string;
    saludo: string;
  } = {
    negocio: config.businessName,
    bot: config.botName,
    saludo
  };
  if (config.customerName) {
    placeholders.nombre = config.customerName;
  }
  const warmth = config.warmth ?? "neutral";
  const conversationalConfig = config.conversationalConfig ?? {
    responses: [],
    handoff_on_low_confidence: false
  };

  if (intent === "greeting") {
    const trigger = config.isReturningCustomer ? "greeting_returning" : "greeting_pure";
    const reply = pickConversationalResponse({
      trigger,
      config: conversationalConfig,
      warmth,
      conversationId: config.conversationId,
      placeholders,
      ...(config.fallbackMessage ? { fallbackMessage: config.fallbackMessage } : {})
    });
    if (reply) return reply;
  } else {
    const reply = pickConversationalResponse({
      trigger: intent,
      config: conversationalConfig,
      warmth,
      conversationId: config.conversationId,
      placeholders,
      ...(config.fallbackMessage ? { fallbackMessage: config.fallbackMessage } : {})
    });
    if (reply) return reply;
  }

  return `${saludo} ¿En qué te puedo ayudar hoy?`;
}
