import { SenderType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export const CONVERSATION_HISTORY_LIMIT = 12;

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const ANAPHORA_RE =
  /^(y\s+)?(ese|esa|eso|el otro|la otra|lo mismo|el mismo|lo de siempre|el de siempre|y el|y la)\b/i;
const FOLLOW_UP_HINT_RE =
  /\b(ese|esa|eso|el de siempre|lo de siempre|como siempre|el usual|mi pedido|la misma|el mismo)\b/i;

export function isAnaphoricFollowUp(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length <= 48 && ANAPHORA_RE.test(normalized)) return true;
  return normalized.length < 90 && FOLLOW_UP_HINT_RE.test(normalized);
}

export function toChatTurns(
  messages: Array<{
    senderType: SenderType | string;
    contentText: string | null;
  }>,
  incomingText?: string
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    const content = (message.contentText ?? "").trim();
    if (!content) continue;
    if (message.senderType === SenderType.SYSTEM || message.senderType === "SYSTEM") continue;

    const role: ChatTurn["role"] =
      message.senderType === SenderType.CUSTOMER || message.senderType === "CUSTOMER"
        ? "user"
        : "assistant";
    const prefix =
      message.senderType === SenderType.HUMAN || message.senderType === "HUMAN" ? "[asesor] " : "";
    turns.push({
      role,
      content: `${prefix}${content}`.slice(0, 1500)
    });
  }

  const incoming = incomingText?.trim();
  if (incoming) {
    const last = turns[turns.length - 1];
    if (last?.role === "user" && last.content === incoming) {
      turns.pop();
    }
  }

  return turns.slice(-CONVERSATION_HISTORY_LIMIT);
}

export function buildRetrievalQuery(incomingText: string, history: ChatTurn[]): string {
  const incoming = incomingText.trim();
  if (!incoming || history.length === 0 || !isAnaphoricFollowUp(incoming)) {
    return incoming;
  }

  const recent = history
    .slice(-4)
    .map((turn) => turn.content)
    .join(" ");
  return `${recent} ${incoming}`.trim();
}

export async function getConversationHistory(input: {
  conversationId: string;
  incomingText?: string;
  limit?: number;
}): Promise<ChatTurn[]> {
  const take = Math.max(1, input.limit ?? CONVERSATION_HISTORY_LIMIT) + 1;
  const rows = await prisma.message.findMany({
    where: {
      conversationId: input.conversationId,
      customerRevokedAt: null
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      senderType: true,
      contentText: true
    }
  });

  return toChatTurns(rows.reverse(), input.incomingText);
}
