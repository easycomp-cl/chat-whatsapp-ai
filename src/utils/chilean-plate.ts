const OLD_PLATE_RE = /^[A-Z]{2}\d{4}$/;
const NEW_PLATE_RE = /^[A-Z]{4}\d{2}$/;

export function normalizeChileanPlate(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

export function isValidChileanPlate(input: string): boolean {
  const normalized = normalizeChileanPlate(input);
  return OLD_PLATE_RE.test(normalized) || NEW_PLATE_RE.test(normalized);
}

export function formatChileanPlate(input: string): string {
  const normalized = normalizeChileanPlate(input);
  if (OLD_PLATE_RE.test(normalized)) {
    return `${normalized.slice(0, 2)} ${normalized.slice(2)}`;
  }
  if (NEW_PLATE_RE.test(normalized)) {
    return `${normalized.slice(0, 2)} ${normalized.slice(2, 4)} ${normalized.slice(4)}`;
  }
  return input.trim().toUpperCase();
}

export function extractChileanPlates(text: string): string[] {
  const found = new Set<string>();
  const candidates =
    text
      .toUpperCase()
      .match(/\b[A-Z]{2}\s?-?\s?\d{4}\b|\b[A-Z]{4}\s?-?\s?\d{2}\b|\b[A-Z]{2}\s[A-Z]{2}\s?-?\s?\d{2}\b/g) ?? [];
  for (const candidate of candidates) {
    if (isValidChileanPlate(candidate)) {
      found.add(normalizeChileanPlate(candidate));
    }
  }
  return [...found];
}
