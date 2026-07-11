import type { ParsedChatMessage } from "../types/parsed-chat-message.type.js";
import type {
  GreetingWarmth,
  SuggestedGreeting
} from "../types/greeting-config.type.js";

const PURE_GREETING_REGEX =
  /^(?:¡|\?)?\s*(?:(?:hol+a+|buen(?:os)?\s*d[ií]as?|buenas?\s*(?:tardes|noches)?|hey|hi|hello|saludos|qu[eé]\s*tal|como\s*est[aá]s?)(?:[\s!.?😊🙂👋✨,]+(?:hol+a+|buen(?:os)?\s*d[ií]as?|buenas?\s*(?:tardes|noches)?))*)[\s!.?😊🙂👋✨]*$/iu;

const GREETING_PREFIX_REGEX =
  /^(?:¡|\?)?\s*(?:hol+a+|buen(?:os)?\s*d[ií]as?|buenas?\s*(?:tardes|noches)?)/iu;

const FILLER_WORDS = new Set([
  "wn",
  "weon",
  "weón",
  "wea",
  "po",
  "prim",
  "xd",
  "jajaja",
  "jajaj",
  "pajaja",
  "lol",
  "bacán",
  "bacan",
  "choro",
  "dale",
  "ya po",
  "sip",
  "sep",
  "ajá",
  "aja",
  "o sea",
  "osea",
  "tipo",
  "bueno",
  "entonces",
  "igual",
  "cachai",
  "cacha"
]);

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function classifyWarmth(text: string): GreetingWarmth {
  const lower = text.toLowerCase();
  if (/[😊🙂👋✨❤️💪]/.test(text) || /hol+a{2,}/i.test(text) || /!{2,}/.test(text)) {
    return "warm";
  }
  if (/buen(?:os)?\s*d[ií]a/i.test(lower) || /^hola[!.\s]*$/i.test(lower)) {
    return "neutral";
  }
  if (/buenas?\s*(?:tardes|noches)/i.test(lower) || /^saludos/i.test(lower)) {
    return "formal";
  }
  return "neutral";
}

function isGreetingMessage(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length > 80) return false;
  return PURE_GREETING_REGEX.test(normalized);
}

function extractFillerWords(messages: string[]): string[] {
  const counts = new Map<string, number>();
  for (const message of messages) {
    const tokens = message
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (FILLER_WORDS.has(token)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
      const pair = i < tokens.length - 1 ? `${token} ${tokens[i + 1]}` : "";
      if (pair && FILLER_WORDS.has(pair)) {
        counts.set(pair, (counts.get(pair) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 12);
}

export class GreetingExtractorService {
  extractFromChat(input: {
    messages: ParsedChatMessage[];
    businessSenderName: string;
    sourceLabel: string;
  }): SuggestedGreeting[] {
    const { messages, businessSenderName, sourceLabel } = input;
    const businessLower = businessSenderName.trim().toLowerCase();
    const greetingCounts = new Map<string, { warmth: GreetingWarmth; count: number }>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || msg.sender.trim().toLowerCase() !== businessLower) continue;

      const text = normalizeText(msg.message);
      if (!isGreetingMessage(text)) continue;

      const prev = messages[i - 1];
      const isConversationStart = i === 0;
      const prevIsCustomer =
        prev && prev.sender.trim().toLowerCase() !== businessLower;
      const prevIsGreeting =
        prev &&
        prev.sender.trim().toLowerCase() !== businessLower &&
        GREETING_PREFIX_REGEX.test(normalizeText(prev.message));

      if (!isConversationStart && !prevIsCustomer && !prevIsGreeting) continue;

      const key = text.toLowerCase();
      const existing = greetingCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        greetingCounts.set(key, { warmth: classifyWarmth(text), count: 1 });
      }
    }

    return [...greetingCounts.entries()]
      .map(([key, meta]) => {
        const original =
          messages.find(
            (m) =>
              m.sender.trim().toLowerCase() === businessLower &&
              normalizeText(m.message).toLowerCase() === key
          )?.message ?? key;
        return {
          text: normalizeText(original),
          warmth: meta.warmth,
          source: sourceLabel,
          usage_count: meta.count
        };
      })
      .sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))
      .slice(0, 8);
  }

  extractFillerWords(businessMessages: string[]): string[] {
    return extractFillerWords(businessMessages);
  }
}

export const greetingExtractorService = new GreetingExtractorService();
