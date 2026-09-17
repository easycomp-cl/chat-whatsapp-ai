import { extractQuantityNear, normalizeQuoteText } from "./product-quote.utils.js";

export type MatchableCatalogProduct = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number | null;
  category: string | null;
  tags: unknown;
};

export type MatchedQuoteLine = {
  product_id: string;
  quantity: number;
  score: number;
};

function asTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((item): item is string => typeof item === "string");
}

function tokenize(value: string): string[] {
  return normalizeQuoteText(value)
    .replace(/(\d+)\s*w\s*-?\s*(\d+)/g, "$1w$2")
    .replace(/(\d+)\s*(l|litro|litros)\b/g, "$1l")
    .replace(/(\d+)\s*(pulgadas|pulgada|")/g, "$1pulg")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || /^\d+$/.test(token));
}

function productTokens(product: MatchableCatalogProduct): Set<string> {
  const blob = [
    product.sku ?? "",
    product.name,
    product.description ?? "",
    product.category ?? "",
    ...asTags(product.tags)
  ].join(" ");
  return new Set(tokenize(blob));
}

function skuPattern(): RegExp {
  return /\becp-[a-z]+-\d{3}\b/gi;
}

export function matchCatalogProductsFromText(
  text: string,
  products: MatchableCatalogProduct[]
): MatchedQuoteLine[] {
  const priced = products.filter((product) => product.price != null && product.price > 0);
  if (!text.trim() || priced.length === 0) {
    return [];
  }

  const queryTokens = new Set(tokenize(text));
  const lines: MatchedQuoteLine[] = [];
  const usedIds = new Set<string>();

  const skuMatches = text.match(skuPattern()) ?? [];
  for (const rawSku of skuMatches) {
    const sku = rawSku.toUpperCase();
    const product = priced.find((item) => (item.sku ?? "").toUpperCase() === sku);
    if (!product || usedIds.has(product.id)) continue;
    usedIds.add(product.id);
    lines.push({
      product_id: product.id,
      quantity: extractQuantityNear(text, sku),
      score: 100
    });
  }

  const scored = priced
    .filter((product) => !usedIds.has(product.id))
    .map((product) => {
      const tokens = productTokens(product);
      let score = 0;
      let distinctive = 0;

      for (const token of queryTokens) {
        if (!tokens.has(token) || token === "ecp") continue;
        if (token.startsWith("ecp") || /^[a-z]+\d{2,}$/.test(token)) {
          score += 8;
          distinctive += 1;
        } else if (/^\d+w\d+$/.test(token) || /^\d+pulg$/.test(token) || /^h[b]?[0-9]$/.test(token)) {
          score += 6;
          distinctive += 1;
        } else if (["aceite", "filtro", "escobilla", "goma", "ampolleta", "luz", "luces", "pastillas", "bujia"].includes(token)) {
          score += 1;
        } else if (token.length >= 4) {
          score += 2;
        }
      }

      if (queryTokens.has("4l") || queryTokens.has("4") && (queryTokens.has("litro") || queryTokens.has("litros"))) {
        if (tokens.has("4l") || [...tokens].some((token) => token.includes("4l"))) {
          score += 4;
          distinctive += 1;
        }
      }
      if (queryTokens.has("1l") || (queryTokens.has("1") && (queryTokens.has("litro") || queryTokens.has("litros")))) {
        if (tokens.has("1l") || [...tokens].some((token) => token.includes("1l"))) {
          score += 3;
        }
      }

      return { product, score, distinctive };
    })
    .filter((entry) => entry.score >= 7 && entry.distinctive >= 1)
    .sort((a, b) => b.score - a.score);

  const grouped = new Map<string, (typeof scored)[number]>();
  for (const entry of scored) {
    const family = familyKey(entry.product, queryTokens);
    const current = grouped.get(family);
    if (!current || entry.score > current.score) {
      grouped.set(family, entry);
    }
  }

  for (const entry of grouped.values()) {
    if (usedIds.has(entry.product.id) || lines.length >= 30) continue;
    usedIds.add(entry.product.id);
    const tags = asTags(entry.product.tags);
    const presentTag = tags.find((tag) => normalizeQuoteText(text).includes(normalizeQuoteText(tag)));
    const qtyNeedle =
      presentTag ||
      entry.product.sku ||
      entry.product.name.split(" ").slice(0, 3).join(" ");
    lines.push({
      product_id: entry.product.id,
      quantity: extractQuantityNear(text, qtyNeedle),
      score: entry.score
    });
  }

  return lines;
}

function familyKey(product: MatchableCatalogProduct, queryTokens: Set<string>): string {
  const category = normalizeQuoteText(product.category ?? "otro");
  if (category.includes("aceite")) {
    const visc = [...queryTokens].find((token) => /^\d+w\d+$/.test(token));
    const size = queryTokens.has("4l") || queryTokens.has("4") ? "4l" : queryTokens.has("1l") ? "1l" : "aceite";
    return `aceite:${visc ?? "x"}:${size}`;
  }
  if (category.includes("ampolle") || category.includes("luz")) {
    const bulb = [...queryTokens].find((token) => /^h[b]?[0-9]$/.test(token) || token === "w5w" || token === "p21w");
    return `luz:${bulb ?? product.sku ?? product.id}`;
  }
  if (category.includes("escob") || category.includes("goma")) {
    const size = [...queryTokens].find((token) => /^\d+pulg$/.test(token) || /^\d+$/.test(token));
    return `escobilla:${size ?? product.sku ?? product.id}`;
  }
  return product.sku ?? product.id;
}
