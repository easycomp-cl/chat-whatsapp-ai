export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "").trim();
}

export function equalsPhone(left: string, right: string): boolean {
  return normalizePhone(left) === normalizePhone(right);
}
