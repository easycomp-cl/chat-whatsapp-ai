const STOPWORDS = new Set([
  "que",
  "cual",
  "cuales",
  "cuanto",
  "cuanta",
  "cuantos",
  "cuantas",
  "como",
  "donde",
  "cuando",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "a",
  "en",
  "y",
  "o",
  "es",
  "son",
  "me",
  "te",
  "se",
  "por",
  "para",
  "con",
  "sin",
  "su",
  "sus",
  "mi",
  "tu",
  "hay",
  "hace",
  "hacen",
  "tiene",
  "tienen",
  "ser",
  "esta",
  "este",
  "estan",
  "quiero",
  "quisiera",
  "necesito",
  "saber",
  "dime",
  "cuesta",
  "cuestan",
  "precio",
  "precios",
  "valor",
  "sale",
  "cobran",
  "cobrar",
  "tienen",
  "tienes",
  "ofrecen",
  "hacen"
]);

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractContentWords(text: string): string[] {
  const normalized = normalizeForMatch(text);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const unique = new Set<string>();

  for (const token of tokens) {
    if (token.length < 3 || STOPWORDS.has(token)) {
      continue;
    }
    unique.add(token);
  }

  return [...unique];
}

export function keywordCoverage(source: string, target: string): number {
  const sourceWords = extractContentWords(source);
  if (!sourceWords.length) {
    return 0;
  }

  const targetNorm = normalizeForMatch(target);
  const matched = sourceWords.filter((word) => targetNorm.includes(word));
  return matched.length / sourceWords.length;
}

export function scoreChunkForQuery(
  query: string,
  chunkText: string,
  embeddingScore: number
): number {
  const queryWords = extractContentWords(query);
  if (!queryWords.length) {
    return embeddingScore;
  }

  const chunkNorm = normalizeForMatch(chunkText);
  const matched = queryWords.filter((word) => chunkNorm.includes(word));
  const coverage = matched.length / queryWords.length;

  if (coverage >= 1) {
    return Math.max(embeddingScore, 0.82);
  }

  if (coverage >= 0.5) {
    return Math.max(embeddingScore, 0.55 + coverage * 0.3);
  }

  return embeddingScore;
}

function stemToken(token: string): string {
  if (token.length <= 4) {
    return token;
  }
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function tokensOverlap(source: string, target: string): string[] {
  const sourceWords = extractContentWords(source);
  const targetNorm = normalizeForMatch(target);
  const targetWords = new Set(extractContentWords(target));

  return sourceWords.filter((word) => {
    const stem = stemToken(word);
    if (targetNorm.includes(word) || targetWords.has(word)) {
      return true;
    }
    for (const targetWord of targetWords) {
      if (stemToken(targetWord) === stem) {
        return true;
      }
    }
    return false;
  });
}

export function scoreFaqDirectMatch(
  userMessage: string,
  faqQuestion: string,
  extraPhrases: string[] = []
): number {
  const candidates = [faqQuestion, ...extraPhrases];
  let best = 0;

  for (const candidate of candidates) {
    const faqCoverage = keywordCoverage(candidate, userMessage);
    const userCoverage = keywordCoverage(userMessage, candidate);
    const matchedWords = tokensOverlap(candidate, userMessage);
    const userWords = extractContentWords(userMessage);

    if (!matchedWords.length) {
      continue;
    }

    const longestMatch = Math.max(...matchedWords.map((word) => word.length));
    const symmetricScore = Math.min(faqCoverage, userCoverage > 0 ? userCoverage : faqCoverage);

    if (userWords.length <= 3 && matchedWords.length === userWords.length) {
      best = Math.max(best, 0.9);
      continue;
    }

    if (faqCoverage >= 0.65 && longestMatch >= 4) {
      best = Math.max(best, Math.max(symmetricScore, faqCoverage));
      continue;
    }

    if (matchedWords.length >= 1 && longestMatch >= 5) {
      best = Math.max(best, Math.max(symmetricScore, 0.75));
      continue;
    }

    if (faqCoverage >= 1 && matchedWords.length >= 2) {
      best = Math.max(best, 1);
      continue;
    }

    if (symmetricScore >= 0.5) {
      best = Math.max(best, symmetricScore);
    }
  }

  return best >= 0.5 ? best : 0;
}
