import type { ProductQuoteDeliveryMethod, ProductQuoteDeliveryView } from "./product-quote.types.js";

export function normalizeQuoteText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function formatClp(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-CL")}`;
}

export function quotePdfFilename(quoteNumber: string): string {
  return `cotizacion-${quoteNumber}.pdf`;
}

export function nextQuoteNumber(existing: string[], year = new Date().getFullYear()): string {
  const prefix = `COT-${year}-`;
  let max = 0;
  for (const value of existing) {
    if (!value.startsWith(prefix)) continue;
    const parsed = Number.parseInt(value.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > max) {
      max = parsed;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function deliveryLabel(
  method: ProductQuoteDeliveryMethod,
  commune: string | null
): string {
  if (method === "pickup") {
    return "Retiro en local";
  }
  if (method === "delivery") {
    return commune?.trim() ? `Despacho a ${commune.trim()}` : "Despacho a domicilio";
  }
  return "Entrega no definida";
}

export function buildDeliveryView(input: {
  method: ProductQuoteDeliveryMethod;
  price: number;
  commune: string | null;
  confirmed: boolean;
}): ProductQuoteDeliveryView {
  return {
    method: input.method,
    label: deliveryLabel(input.method, input.commune),
    price: input.price,
    commune: input.commune,
    confirmed: input.confirmed
  };
}

export function toWinAnsi(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export function isProductQuoteRequest(text: string): boolean {
  const normalized = normalizeQuoteText(text);
  if (!normalized) return false;

  return (
    /\bcotiz/.test(normalized) ||
    /\bpresupuesto\b/.test(normalized) ||
    /\bquote\b/.test(normalized) ||
    /mand(a|ame|ame la) (la )?(coti|pdf)/.test(normalized) ||
    /pas(a|ame) (la )?(coti|cotizacion)/.test(normalized) ||
    /arm(a|ame) (la )?cotiz/.test(normalized) ||
    /\blo quiero\b/.test(normalized) ||
    /\blos quiero\b/.test(normalized) ||
    /\bla quiero\b/.test(normalized)
  );
}

export function extractDeliveryFromText(text: string): {
  method: ProductQuoteDeliveryMethod;
  commune: string | null;
} {
  const normalized = normalizeQuoteText(text);
  const wantsPickup = /\b(retiro|pickup|pasar a buscar|voy al local)\b/.test(normalized);
  const wantsDelivery = /\b(despacho|envio|envío|delivery|a domicilio)\b/.test(normalized);

  let commune: string | null = null;
  const communeMatch = normalized.match(
    /\b(?:a|en|hacia)\s+(maipu|maipú|providencia|nunoa|ñuñoa|las condes|vitacura|la reina|puente alto|san bernardo|la florida|penalolen|peñalolén|macul|recoleta|independencia|santiago)\b/
  );
  if (communeMatch?.[1]) {
    commune = restoreCommuneName(communeMatch[1]);
  }

  if (wantsPickup && !wantsDelivery) {
    return { method: "pickup", commune };
  }
  if (wantsDelivery) {
    return { method: "delivery", commune };
  }
  return { method: "none", commune };
}

function restoreCommuneName(raw: string): string {
  const map: Record<string, string> = {
    maipu: "Maipú",
    providencia: "Providencia",
    nunoa: "Ñuñoa",
    "las condes": "Las Condes",
    vitacura: "Vitacura",
    "la reina": "La Reina",
    "puente alto": "Puente Alto",
    "san bernardo": "San Bernardo",
    "la florida": "La Florida",
    penalolen: "Peñalolén",
    macul: "Macul",
    recoleta: "Recoleta",
    independencia: "Independencia",
    santiago: "Santiago"
  };
  return map[normalizeQuoteText(raw)] ?? raw;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10
};

export function extractQuantityNear(haystack: string, needle: string): number {
  const normalizedHay = ` ${normalizeQuoteText(haystack)} `;
  const normalizedNeedle = normalizeQuoteText(needle);
  if (!normalizedNeedle) return 1;

  const idx = normalizedHay.indexOf(normalizedNeedle);
  if (idx < 0) return 1;

  const windowStart = Math.max(0, idx - 18);
  const before = normalizedHay.slice(windowStart, idx);
  const after = normalizedHay.slice(idx + normalizedNeedle.length, idx + normalizedNeedle.length + 12);

  const beforeNum = before.match(/(\d+)\s*(?:x|unidades|uds)?\s*(?:\S{1,12}\s+)?$/);
  if (beforeNum?.[1]) {
    const parsed = Number.parseInt(beforeNum[1], 10);
    if (parsed >= 1 && parsed <= 99) return parsed;
  }

  const afterNum = after.match(/^\s*x\s*(\d+)/);
  if (afterNum?.[1]) {
    const parsed = Number.parseInt(afterNum[1], 10);
    if (parsed >= 1 && parsed <= 99) return parsed;
  }

  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(before)) {
      return value;
    }
  }

  return 1;
}

export function defaultQuoteCaption(input: {
  customerName: string | null;
  quoteNumber: string;
  total: number;
}): string {
  const hello = input.customerName?.trim() ? `Hola ${input.customerName.trim()}` : "Hola";
  return `${hello}, te adjunto la cotización ${input.quoteNumber}. Total ${formatClp(input.total)} CLP (IVA incluido). ¿Retiro en local o despacho?`;
}
