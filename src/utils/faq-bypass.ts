import { extractContentWords, normalizeForMatch } from "./direct-match.js";

const QUOTE_REQUEST_ANSWER_PATTERN =
  /ind[ií]canos|necesitamos para cotizar|te cotizamos|env[ií]anos|dinos las medidas/i;

const SPECIFICATION_PATTERNS = [
  /\d+\s*[x×]\s*\d+/,
  /\d+\s*(cm|mm|mts?|metros?)\b/i,
  /\b(roble|lingue|lingüe|raul[ií]|nogal|encino|cipr[eé]s|cedro|maple|olmo|araucaria)\b/i,
  /\bgrabad/i,
  /\bl[aá]ser\b/i,
  /\bengravad/i
];

export function messageHasQuoteSpecifications(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return SPECIFICATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isQuoteRequestFaqAnswer(answer: string): boolean {
  return QUOTE_REQUEST_ANSWER_PATTERN.test(normalizeForMatch(answer));
}

function hasDistinctIntentFromFaq(userMessage: string, faqQuestion: string): boolean {
  const faqWords = new Set(extractContentWords(faqQuestion));
  const extraWords = extractContentWords(userMessage).filter(
    (word) => !faqWords.has(word) && word.length >= 5
  );
  return extraWords.length >= 1;
}

/** Skip generic FAQ when the customer already gave specs or asks a narrower product question. */
export function shouldBypassFaqMatch(
  userMessage: string,
  faqQuestion: string,
  faqAnswer: string
): boolean {
  if (messageHasQuoteSpecifications(userMessage)) {
    return true;
  }

  if (isQuoteRequestFaqAnswer(faqAnswer) && hasDistinctIntentFromFaq(userMessage, faqQuestion)) {
    return true;
  }

  return false;
}
