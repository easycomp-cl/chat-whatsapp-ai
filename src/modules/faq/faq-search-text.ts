export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function buildFaqSearchText(input: {
  question: string;
  alternatePhrases?: unknown;
  keywords?: unknown;
}): string {
  const phrases = parseStringArray(input.alternatePhrases);
  const keywords = parseStringArray(input.keywords);
  return [input.question, ...phrases, ...keywords].join("\n");
}

export function faqMatchCandidates(input: {
  question: string;
  alternatePhrases?: unknown;
  keywords?: unknown;
}): string[] {
  const phrases = parseStringArray(input.alternatePhrases);
  const keywords = parseStringArray(input.keywords);
  return [input.question, ...phrases, ...keywords];
}
