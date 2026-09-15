const FOUNDATIONAL_PATTERNS = [
  /qu[eé]\s+venden/i,
  /qu[eé]\s+ofrecen/i,
  /qu[eé]\s+productos/i,
  /qu[eé]\s+servicios/i,
  /a\s+qu[eé]\s+se\s+dedican/i,
  /qui[eé]nes\s+son/i,
  /de\s+qu[eé]\s+trata/i,
  /qu[eé]\s+hacen/i
];

export function isFoundationalBusinessQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return FOUNDATIONAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}
