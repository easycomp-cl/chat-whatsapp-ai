import type { SenderType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { quotedUnavailableText, truncateQuotedText } from "../../utils/quoted-text.js";

export type ResolvedReplyContext = {
  replyToMessageId: string | null;
  quotedText: string;
  quotedSenderType: SenderType | null;
  replyToExternalId: string | null;
};

export async function resolveReplyContext(
  externalMessageId: string
): Promise<ResolvedReplyContext> {
  const target = await prisma.message.findFirst({
    where: { externalId: externalMessageId },
    select: {
      id: true,
      contentText: true,
      senderType: true
    }
  });

  if (!target) {
    return {
      replyToMessageId: null,
      quotedText: quotedUnavailableText(),
      quotedSenderType: null,
      replyToExternalId: externalMessageId
    };
  }

  return {
    replyToMessageId: target.id,
    quotedText: truncateQuotedText(target.contentText),
    quotedSenderType: target.senderType,
    replyToExternalId: null
  };
}
