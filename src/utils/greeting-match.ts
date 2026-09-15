import { extractContentWords, normalizeForMatch } from "./direct-match.js";

/** Colapsa letras repetidas 3+ veces para matching tolerante (holiii → holii). */
export function collapseForGreetingMatch(text: string): string {
  return text.replace(/(.)\1{2,}/g, "$1$1");
}

function normalizeGreetingText(text: string): string {
  return collapseForGreetingMatch(normalizeForMatch(text));
}

const GREETING_PREFIX =
  /^(?:hol+[aio]*|buenas+|buenos?\s*dias?|buen\s*dia|buenas?\s*(?:tardes|noches)?|hey|hi|hello|saludos|que\s*tal|como\s*estas?)\b/;

const PURE_GREETING_PATTERNS = [
  /^hol+[aio]*$/,
  /^buenas+$/,
  /^buenos?\s*dias?$/,
  /^buenas?\s*tardes$/,
  /^buenas?\s*noches$/,
  /^buen\s*dia$/,
  /^hey+$/,
  /^hi+$/,
  /^hello+$/,
  /^saludos?$/,
  /^que\s*tal$/,
  /^como\s*estas?$/,
  /^estas?$/,
  /^todo\s*bien$/,
  /^como\s*andas?$/,
  /^como\s*va$/
];

const SOCIAL_TAIL_PATTERNS = [
  /^como\s*estas?$/,
  /^que\s*tal$/,
  /^estas?$/,
  /^todo\s*bien$/,
  /^como\s*andas?$/,
  /^como\s*va$/
];

const BUSINESS_QUESTION_SIGNALS: RegExp[] = [
  /\?/,
  /\b(cuanto|cuanta|cuantos|cuantas|precio|precios|valor|cuesta|cuestan|sale|cobran|cobrar)\b/,
  /\b(horario|abierto|abierta|atendiendo|atienden|disponible|disponibilidad)\b/,
  /\b(tienen|tienes|ofrecen|hacen|hay)\b/,
  /\b(donde|cuando|entrega|envio|envío|agendar|reservar|cotizacion|cotización)\b/,
  /\b(quiero|necesito|quisiera|busco|informacion|información|consulta)\b/
];

export function hasGreetingPrefix(text: string): boolean {
  const normalized = normalizeGreetingText(text);
  return Boolean(normalized && GREETING_PREFIX.test(normalized));
}

export function hasBusinessQuestionSignal(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;
  return BUSINESS_QUESTION_SIGNALS.some((pattern) => pattern.test(normalized));
}

function stripGreetingPrefix(normalized: string): string {
  return normalized.replace(GREETING_PREFIX, "").trim();
}

function isSocialGreetingTail(normalized: string): boolean {
  const tail = stripGreetingPrefix(normalized);
  if (!tail) return true;
  return SOCIAL_TAIL_PATTERNS.some((pattern) => pattern.test(tail));
}

export function isPureGreeting(text: string): boolean {
  const normalized = normalizeGreetingText(text);
  if (!normalized) return false;

  if (PURE_GREETING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (!GREETING_PREFIX.test(normalized)) {
    return false;
  }

  if (hasBusinessQuestionSignal(text)) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 10) {
    return false;
  }

  if (isSocialGreetingTail(normalized)) {
    return true;
  }

  const businessWords = extractContentWords(normalized);
  return businessWords.length === 0;
}

export function isGreetingLike(text: string): boolean {
  return isPureGreeting(text);
}

export function isGreetingWithBusinessQuestion(text: string): boolean {
  if (!hasGreetingPrefix(text)) {
    return false;
  }
  if (isPureGreeting(text)) {
    return false;
  }
  return hasBusinessQuestionSignal(text);
}
