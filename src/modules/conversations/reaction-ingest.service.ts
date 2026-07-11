import { SenderType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import type { NormalizedIncomingReaction } from "../../types/whatsapp.js";
import { normalizePhone } from "../../utils/phone.js";

export class ReactionIngestService {
  async ingestCustomerReaction(input: {
    tenantId: string;
    reaction: NormalizedIncomingReaction;
  }) {
    const senderPhone = normalizePhone(input.reaction.fromPhone);
    const target = await prisma.message.findFirst({
      where: { externalId: input.reaction.targetMessageId },
      select: {
        id: true,
        tenantId: true,
        conversationId: true
      }
    });

    if (!target) {
      logger.warn(
        {
          targetExternalId: input.reaction.targetMessageId,
          reactionExternalId: input.reaction.externalMessageId,
          senderPhone
        },
        "Reaction target message not found by externalId"
      );
      return null;
    }

    if (target.tenantId !== input.tenantId) {
      logger.warn(
        { tenantId: input.tenantId, targetTenantId: target.tenantId },
        "Reaction target belongs to another tenant"
      );
      return null;
    }

    if (!input.reaction.emoji) {
      await prisma.messageReaction.deleteMany({
        where: {
          messageId: target.id,
          senderPhone
        }
      });
      return { action: "removed" as const, messageId: target.id };
    }

    const reaction = await prisma.messageReaction.upsert({
      where: {
        messageId_senderPhone: {
          messageId: target.id,
          senderPhone
        }
      },
      create: {
        tenantId: target.tenantId,
        conversationId: target.conversationId,
        messageId: target.id,
        emoji: input.reaction.emoji,
        senderType: SenderType.CUSTOMER,
        senderPhone,
        externalId: input.reaction.externalMessageId
      },
      update: {
        emoji: input.reaction.emoji,
        externalId: input.reaction.externalMessageId,
        updatedAt: new Date()
      }
    });

    return { action: "upserted" as const, messageId: target.id, reaction };
  }
}

export const reactionIngestService = new ReactionIngestService();
