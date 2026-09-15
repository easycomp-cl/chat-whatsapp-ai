const RUT_BODY_REGEX = /^(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])$/;

export function normalizeRutStorage(input: string): string {
  const cleaned = input.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  if (cleaned.length < 2) {
    return cleaned;
  }
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  return `${body}-${dv}`;
}

export function formatRutDisplay(input: string): string {
  const normalized = normalizeRutStorage(input);
  const match = normalized.match(/^(\d+)-([\dK])$/);
  if (!match) {
    return input.trim();
  }
  const digits = match[1]!;
  const dv = match[2]!;
  const reversed = digits.split("").reverse();
  const parts: string[] = [];
  for (let i = 0; i < reversed.length; i += 3) {
    parts.push(reversed.slice(i, i + 3).reverse().join(""));
  }
  return `${parts.reverse().join(".")}-${dv}`;
}

function rutCheckDigit(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

export function isValidChileanRut(input: string): boolean {
  const normalized = normalizeRutStorage(input);
  const match = normalized.match(/^(\d{7,8})-([\dK])$/);
  if (!match) {
    return false;
  }
  const [, body, dv] = match;
  return rutCheckDigit(body!) === dv;
}

export function validateOptionalRut(input: string | null | undefined): string | null {
  if (input == null) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (!isValidChileanRut(trimmed)) {
    throw new Error("RUT inválido");
  }
  return normalizeRutStorage(trimmed);
}

export function looksLikeRutInput(input: string): boolean {
  return RUT_BODY_REGEX.test(input.trim()) || /^\d{7,8}-?[\dkK]$/i.test(input.trim());
}
