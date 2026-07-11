import { extractContentWords, normalizeForMatch } from "./direct-match.js";

export type ConversationalIntent = "greeting" | "thanks" | "ack";

const GREETING_PREFIX =
  /^(hola+|buenas?|hey|hi|hello|que tal|como estas?|buenos dias|buen dia|buenas tardes|buenas noches)\b/;

const GREETING_PATTERNS = [
  /^hola+$/,
  /^holaa+$/,
  /^buenas?$/,
  /^buenos dias$/,
  /^buenas tardes$/,
  /^buenas noches$/,
  /^buen dia$/,
  /^hey$/,
  /^hi$/,
  /^hello$/,
  /^saludos$/,
  /^que tal$/,
  /^como estas?$/,
  /^estas$/,
  /^todo bien$/,
  /^como andas?$/,
  /^como va$/,
  /^buen dia$/,
  /^buenas tardes$/,
  /^buenas noches$/
];

const THANKS_PATTERNS = [/^gracias$/, /^muchas gracias$/, /^mil gracias$/, /^te agradezco$/];

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

function isShortGreeting(normalized: string): boolean {
  if (GREETING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (!GREETING_PREFIX.test(normalized)) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 8) {
    return false;
  }

  const businessWords = extractContentWords(normalized);
  return businessWords.length <= 2;
}

export function isGreetingWithBusinessQuestion(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized || !GREETING_PREFIX.test(normalized)) {
    return false;
  }
  if (isShortGreeting(normalized)) {
    return false;
  }
  const businessWords = extractContentWords(normalized);
  return businessWords.length >= 2;
}

export function detectConversationalIntent(text: string): ConversationalIntent | null {
  const normalized = normalizeForMatch(text);
  if (!normalized) {
    return null;
  }

  if (isShortGreeting(normalized)) {
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

export function buildConversationalReply(
  intent: ConversationalIntent,
  config: { greetingMessage: string; botName: string; toneGreeting?: string }
): string {
  switch (intent) {
    case "greeting": {
      const greeting = config.toneGreeting ?? config.greetingMessage;
      return `${greeting} ¿En qué te puedo ayudar hoy?`;
    }
    case "thanks":
      return "¡Con gusto! Si necesitas algo más, aquí estoy.";
    case "ack":
      return `Perfecto. Si tienes otra consulta, escríbeme.`;
  }
}
