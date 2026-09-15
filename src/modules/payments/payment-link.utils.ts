import { randomBytes } from "node:crypto";

const CODE_MAX_LENGTH = 80;

export function slugifyPaymentCode(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CODE_MAX_LENGTH);
  return slug || `pedido-${randomBytes(4).toString("hex")}`;
}

export function readHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function readPaymentDestinationUrl(configJson: unknown): string | null {
  if (!configJson || typeof configJson !== "object" || Array.isArray(configJson)) {
    return null;
  }
  const record = configJson as Record<string, unknown>;
  return readHttpsUrl(record.payment_url ?? record.paymentUrl);
}
