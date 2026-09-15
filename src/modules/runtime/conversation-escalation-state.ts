import { SenderType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

const DEFAULT_SOFT_FALLBACK_MARKERS = [
  "no tengo esa información",
  "no tengo suficiente",
  "¿te ayudo con algo más?"
];

export function isSoftFallbackBotText(text: string, fallbackMessage?: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return false;

  const markers = [...DEFAULT_SOFT_FALLBACK_MARKERS];
  const custom = fallbackMessage?.trim().toLowerCase();
  if (custom && custom.length >= 12) {
    markers.push(custom);
  }

  return markers.some((marker) => normalized.includes(marker));
}

export async function getRecentBotMessageTexts(
  conversationId: string,
  limit = 6
): Promise<string[]> {
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      senderType: SenderType.BOT,
      direction: "OUTBOUND"
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { contentText: true }
  });

  return messages.map((m) => m.contentText).filter(Boolean);
}

export function countConsecutiveSoftFallbacks(
  recentBotMessagesNewestFirst: string[],
  fallbackMessage?: string
): number {
  let count = 0;
  for (const text of recentBotMessagesNewestFirst) {
    if (!isSoftFallbackBotText(text, fallbackMessage)) break;
    count += 1;
  }
  return count;
}

export function previousBotWasSoftFallback(
  recentBotMessagesNewestFirst: string[],
  fallbackMessage?: string
): boolean {
  const last = recentBotMessagesNewestFirst[0];
  if (!last) return false;
  return isSoftFallbackBotText(last, fallbackMessage);
}
