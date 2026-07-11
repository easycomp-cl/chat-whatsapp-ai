const QUOTED_UNAVAILABLE = "[Mensaje no disponible]";

export function truncateQuotedText(text: string, max = 300): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function quotedUnavailableText(): string {
  return QUOTED_UNAVAILABLE;
}
