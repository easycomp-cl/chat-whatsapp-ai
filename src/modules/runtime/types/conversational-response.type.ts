import type { GreetingWarmth } from "../../chat-analysis/types/greeting-config.type.js";

export type ConversationalTrigger =
  | "greeting_pure"
  | "greeting_returning"
  | "thanks"
  | "ack"
  | "soft_fallback";

export type ResponseVariant = {
  text: string;
  warmth?: GreetingWarmth;
  weight?: number;
};

export type ConversationalResponseSet = {
  trigger: ConversationalTrigger;
  variants: ResponseVariant[];
  selection: "random" | "round_robin" | "by_warmth";
  enabled: boolean;
};

export type ConversationalConfig = {
  responses: ConversationalResponseSet[];
  handoff_on_low_confidence: boolean;
};

export const DEFAULT_CONVERSATIONAL_CONFIG: ConversationalConfig = {
  responses: [],
  handoff_on_low_confidence: false
};

export const DEFAULT_CONVERSATIONAL_REPLIES: Record<
  Exclude<ConversationalTrigger, "greeting_returning" | "soft_fallback">,
  string
> = {
  greeting_pure: "{saludo} ¿En qué te puedo ayudar hoy?",
  thanks: "¡Con gusto! Si necesitas algo más, aquí estoy.",
  ack: "Perfecto. Si tienes otra consulta, escríbeme."
};
