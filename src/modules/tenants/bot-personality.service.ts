import type { Prisma } from "@prisma/client";
import type { GreetingConfig, SuggestedGreeting } from "../chat-analysis/types/greeting-config.type.js";
import { DEFAULT_GREETING_CONFIG } from "../chat-analysis/types/greeting-config.type.js";
import {
  parseConversationalConfig
} from "../runtime/conversational-response.service.js";
import type {
  ConversationalConfig,
  ConversationalResponseSet,
  ConversationalTrigger
} from "../runtime/types/conversational-response.type.js";
import {
  parseToneGreetingConfig,
  parseToneGreetings
} from "../runtime/greeting-runtime.service.js";

export const CONVERSATIONAL_PLACEHOLDERS = ["{nombre}", "{negocio}", "{bot}", "{saludo}"] as const;

export const CONVERSATIONAL_TRIGGER_META: Record<
  ConversationalTrigger,
  { label: string; description: string; default_selection: ConversationalResponseSet["selection"] }
> = {
  greeting_pure: {
    label: "Saludo (cliente nuevo)",
    description: "Cuando el cliente solo saluda: hola, buenas, holiii, etc.",
    default_selection: "by_warmth"
  },
  greeting_returning: {
    label: "Saludo (cliente frecuente)",
    description: "Saludo para contactos con historial previo. Usa {nombre} si conoces el alias.",
    default_selection: "by_warmth"
  },
  thanks: {
    label: "Agradecimiento",
    description: "Respuesta a gracias, muchas gracias, etc.",
    default_selection: "random"
  },
  ack: {
    label: "Confirmación",
    description: "Respuesta a ok, vale, listo, perfecto, etc.",
    default_selection: "round_robin"
  },
  soft_fallback: {
    label: "Sin información",
    description: "Cuando no hay contexto suficiente pero conviene no derivar a humano de inmediato.",
    default_selection: "random"
  }
};

export type BotPersonalitySnapshot = {
  bot_name: string;
  bot_tone: string;
  greeting_message: string;
  fallback_message: string;
  handoff_message: string;
  out_of_hours_message: string;
  greeting_config: GreetingConfig;
  tone_greetings: SuggestedGreeting[];
  conversational_responses: ConversationalResponseSet[];
  handoff_on_low_confidence: boolean;
  placeholders: readonly string[];
  triggers: Array<{
    id: ConversationalTrigger;
    label: string;
    description: string;
    default_selection: ConversationalResponseSet["selection"];
  }>;
};

export type BotPersonalityPatch = {
  bot_name?: string;
  bot_tone?: string;
  greeting_message?: string;
  fallback_message?: string;
  handoff_message?: string;
  out_of_hours_message?: string;
  greeting_config?: Partial<GreetingConfig>;
  tone_greetings?: SuggestedGreeting[];
  conversational_responses?: ConversationalResponseSet[];
  handoff_on_low_confidence?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mergeGreetingConfig(patch?: Partial<GreetingConfig>): GreetingConfig {
  return {
    new_customer_warmth: patch?.new_customer_warmth ?? DEFAULT_GREETING_CONFIG.new_customer_warmth,
    returning_customer_warmth:
      patch?.returning_customer_warmth ?? DEFAULT_GREETING_CONFIG.returning_customer_warmth,
    returning_min_messages:
      patch?.returning_min_messages ?? DEFAULT_GREETING_CONFIG.returning_min_messages,
    combine_greeting_with_answers:
      patch?.combine_greeting_with_answers ?? DEFAULT_GREETING_CONFIG.combine_greeting_with_answers
  };
}

export function buildBotPersonalitySnapshot(input: {
  botName: string;
  botTone: string;
  greetingMessage: string;
  fallbackMessage: string;
  handoffMessage: string;
  outOfHoursMessage: string;
  configJson: unknown;
}): BotPersonalitySnapshot {
  const conversational = parseConversationalConfig(input.configJson);
  return {
    bot_name: input.botName,
    bot_tone: input.botTone,
    greeting_message: input.greetingMessage,
    fallback_message: input.fallbackMessage,
    handoff_message: input.handoffMessage,
    out_of_hours_message: input.outOfHoursMessage,
    greeting_config: parseToneGreetingConfig(input.configJson),
    tone_greetings: parseToneGreetings(input.configJson),
    conversational_responses: conversational.responses,
    handoff_on_low_confidence: conversational.handoff_on_low_confidence,
    placeholders: CONVERSATIONAL_PLACEHOLDERS,
    triggers: Object.entries(CONVERSATIONAL_TRIGGER_META).map(([id, meta]) => ({
      id: id as ConversationalTrigger,
      ...meta
    }))
  };
}

export function mergeBotPersonalityConfigJson(
  existingConfigJson: unknown,
  patch: BotPersonalityPatch
): Prisma.InputJsonValue {
  const record = asRecord(existingConfigJson);
  const conversational = parseConversationalConfig(existingConfigJson);
  const nextConversational: ConversationalConfig = {
    responses: patch.conversational_responses ?? conversational.responses,
    handoff_on_low_confidence:
      patch.handoff_on_low_confidence ?? conversational.handoff_on_low_confidence
  };

  const nextGreetingConfig = patch.greeting_config
    ? mergeGreetingConfig({
        ...parseToneGreetingConfig(existingConfigJson),
        ...patch.greeting_config
      })
    : parseToneGreetingConfig(existingConfigJson);

  return {
    ...record,
    toneGreetingConfig: nextGreetingConfig,
    ...(patch.tone_greetings !== undefined ? { toneGreetings: patch.tone_greetings } : {}),
    conversationalResponses: nextConversational.responses,
    handoff_on_low_confidence: nextConversational.handoff_on_low_confidence
  };
}
