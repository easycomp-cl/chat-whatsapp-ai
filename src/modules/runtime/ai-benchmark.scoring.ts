function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.$]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesFolded(haystack: string, needle: string): boolean {
  const hay = fold(haystack);
  const need = fold(needle);
  if (!need) return false;
  const compactHay = hay.replace(/[.\s]/g, "");
  const compactNeed = need.replace(/[.\s]/g, "");
  return hay.includes(need) || (compactNeed.length >= 4 && compactHay.includes(compactNeed));
}

export type BenchmarkScoreSpec = {
  requireAny?: string[];
  requireAll?: string[];
  forbidAny?: string[];
};

export type BenchmarkScoreResult = {
  passed: boolean;
  score: number;
  matched: string[];
  missed: string[];
  forbiddenHits: string[];
};

export function scoreBenchmarkReply(reply: string, spec: BenchmarkScoreSpec): BenchmarkScoreResult {
  const matched: string[] = [];
  const missed: string[] = [];
  const forbiddenHits: string[] = [];
  let checks = 0;
  let earned = 0;

  for (const needle of spec.requireAll ?? []) {
    checks += 1;
    if (includesFolded(reply, needle)) {
      earned += 1;
      matched.push(needle);
    } else {
      missed.push(needle);
    }
  }

  const requireAny = spec.requireAny ?? [];
  if (requireAny.length) {
    checks += 1;
    const hit = requireAny.find((needle) => includesFolded(reply, needle));
    if (hit) {
      earned += 1;
      matched.push(hit);
    } else {
      missed.push(requireAny.join(" | "));
    }
  }

  if (spec.forbidAny?.length) {
    checks += 1;
    for (const needle of spec.forbidAny) {
      if (includesFolded(reply, needle)) forbiddenHits.push(needle);
    }
    if (!forbiddenHits.length) earned += 1;
  }

  return {
    passed: missed.length === 0 && forbiddenHits.length === 0,
    score: checks === 0 ? 0 : earned / checks,
    matched,
    missed,
    forbiddenHits
  };
}
