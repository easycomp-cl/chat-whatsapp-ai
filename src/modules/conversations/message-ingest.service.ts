import {
  ConversationMode,
  ConversationStatus,
  MessageDirection,
  SenderType,
  WhatsappDeliveryStatus
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { NormalizedIncomingMessage } from "../../types/whatsapp.js";
import { normalizePhone } from "../../utils/phone.js";
import { usageEventsService, USAGE_EVENT_TYPES } from "../metrics/usage-events.service.js";
import { resolveReplyContext } from "./resolve-reply-context.js";

export const CUSTOMER_REVOKED_MESSAGE_TEXT = "Mensaje eliminado por el usuario";

export class MessageIngestService {
  async ingestCustomerMessage(input: {
    tenantId: string;
    channelPhoneNumber: string;
    message: NormalizedIncomingMessage;
  }) {
    const customer = await prisma.customer.upsert({
      where: {
        tenantId_phoneNumber: {
          tenantId: input.tenantId,
          phoneNumber: normalizePhone(input.message.fromPhone)
        }
      },
      create: {
        tenantId: input.tenantId,
        phoneNumber: normalizePhone(input.message.fromPhone),
        name: input.message.fromName ?? null,
        lastSeenAt: input.message.timestamp
      },
      update: {
        name: input.message.fromName ?? null,
        lastSeenAt: input.message.timestamp
      }
    });

    const conversation =
      (await prisma.conversation.findFirst({
        where: {
          tenantId: input.tenantId,
          customerId: customer.id,
          status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] }
        },
        orderBy: { updatedAt: "desc" }
      })) ??
      (await prisma.conversation.create({
        data: {
          tenantId: input.tenantId,
          customerId: customer.id,
          channelPhoneNumber: normalizePhone(input.channelPhoneNumber),
          status: ConversationStatus.OPEN,
          mode: ConversationMode.BOT,
          lastMessageAt: input.message.timestamp
        }
      }));

    const existing = await prisma.message.findFirst({
      where: { externalId: input.message.externalMessageId },
      select: { id: true }
    });
    if (existing) {
      const existingFull = await prisma.message.findUnique({
        where: { id: existing.id },
        include: { conversation: true, customer: true }
      });
      if (existingFull?.customer && existingFull.conversation) {
        return {
          customer: existingFull.customer,
          conversation: existingFull.conversation,
          message: existingFull,
          isDuplicate: true
        };
      }
    }

    const replyFields = input.message.replyContext
      ? await resolveReplyContext(input.message.replyContext.externalMessageId)
      : {
          replyToMessageId: null,
          quotedText: null,
          quotedSenderType: null,
          replyToExternalId: null
        };

    const persistedMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        tenantId: input.tenantId,
        customerId: customer.id,
        direction: MessageDirection.INBOUND,
        senderType: SenderType.CUSTOMER,
        senderPhone: normalizePhone(input.message.fromPhone),
        receiverPhone: normalizePhone(input.channelPhoneNumber),
        contentText: input.message.text,
        externalId: input.message.externalMessageId,
        replyToMessageId: replyFields.replyToMessageId,
        quotedText: replyFields.quotedText,
        quotedSenderType: replyFields.quotedSenderType,
        replyToExternalId: replyFields.replyToExternalId,
        rawPayloadJson: input.message.rawPayload ?? {}
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: input.message.timestamp,
        status: ConversationStatus.OPEN
      }
    });

    await usageEventsService.track({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      eventType: USAGE_EVENT_TYPES.MESSAGE_RECEIVED,
      metadata: { messageId: persistedMessage.id }
    });

    return { customer, conversation, message: persistedMessage, isDuplicate: false };
  }

  async findPendingBotOutbound(input: {
    conversationId: string;
    after: Date;
  }) {
    return prisma.message.findFirst({
      where: {
        conversationId: input.conversationId,
        direction: MessageDirection.OUTBOUND,
        senderType: SenderType.BOT,
        externalId: null,
        createdAt: { gte: input.after }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async ingestBotMessage(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    botPhone: string;
    customerPhone: string;
    text: string;
    aiGenerated?: boolean;
    externalId?: string | null;
  }) {
    const message = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        customerId: input.customerId,
        direction: MessageDirection.OUTBOUND,
        senderType: SenderType.BOT,
        senderPhone: normalizePhone(input.botPhone),
        receiverPhone: normalizePhone(input.customerPhone),
        contentText: input.text,
        aiGenerated: input.aiGenerated ?? false,
        externalId: input.externalId ?? null,
        whatsappDeliveryStatus:
          input.externalId != null
            ? WhatsappDeliveryStatus.SENT
            : WhatsappDeliveryStatus.PENDING
      }
    });

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: new Date() }
    });

    return message;
  }

  async setMessageExternalId(messageId: string, externalId: string) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        externalId,
        whatsappDeliveryStatus: WhatsappDeliveryStatus.SENT
      }
    });
  }

  async markDeliveryPending(messageId: string) {
    await prisma.message.update({
      where: { id: messageId },
      data: { whatsappDeliveryStatus: WhatsappDeliveryStatus.PENDING }
    });
  }

  async markDeliveryFailed(messageId: string) {
    await prisma.message.update({
      where: { id: messageId },
      data: { whatsappDeliveryStatus: WhatsappDeliveryStatus.FAILED }
    });
  }

  async updateMessageText(messageId: string, text: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: { contentText: text }
    });
  }

  async applyCustomerMessageEdit(input: {
    tenantId: string;
    originalMessageId: string;
    text: string;
    editedAt?: Date;
  }) {
    const target = await prisma.message.findFirst({
      where: { externalId: input.originalMessageId },
      select: {
        id: true,
        tenantId: true,
        direction: true,
        senderType: true,
        contentText: true,
        contentTextSnapshot: true,
        customerRevokedAt: true
      }
    });

    if (!target) {
      return { updated: false as const, reason: "not_found" as const };
    }

    if (target.tenantId !== input.tenantId) {
      return { updated: false as const, reason: "tenant_mismatch" as const };
    }

    if (
      target.direction !== MessageDirection.INBOUND ||
      target.senderType !== SenderType.CUSTOMER
    ) {
      return { updated: false as const, reason: "not_customer_inbound" as const };
    }

    if (target.customerRevokedAt) {
      return { updated: false as const, reason: "already_revoked" as const };
    }

    if (target.contentText.trim() === input.text.trim()) {
      return { updated: false as const, reason: "unchanged" as const, messageId: target.id };
    }

    const editedAt = input.editedAt ?? new Date();

    await prisma.message.update({
      where: { id: target.id },
      data: {
        contentText: input.text.trim(),
        contentTextSnapshot: target.contentTextSnapshot ?? target.contentText,
        customerEditedAt: editedAt
      }
    });

    return { updated: true as const, messageId: target.id };
  }

  async applyCustomerMessageRevoke(input: {
    tenantId: string;
    originalMessageId: string;
    revokedAt?: Date;
  }) {
    const target = await prisma.message.findFirst({
      where: { externalId: input.originalMessageId },
      select: {
        id: true,
        tenantId: true,
        direction: true,
        senderType: true,
        contentText: true,
        customerRevokedAt: true
      }
    });

    if (!target) {
      return { updated: false as const, reason: "not_found" as const };
    }

    if (target.tenantId !== input.tenantId) {
      return { updated: false as const, reason: "tenant_mismatch" as const };
    }

    if (
      target.direction !== MessageDirection.INBOUND ||
      target.senderType !== SenderType.CUSTOMER
    ) {
      return { updated: false as const, reason: "not_customer_inbound" as const };
    }

    if (target.customerRevokedAt) {
      return { updated: false as const, reason: "unchanged" as const, messageId: target.id };
    }

    const revokedAt = input.revokedAt ?? new Date();
    const snapshot =
      target.contentText === CUSTOMER_REVOKED_MESSAGE_TEXT
        ? null
        : target.contentText;

    await prisma.message.update({
      where: { id: target.id },
      data: {
        contentTextSnapshot: snapshot,
        contentText: CUSTOMER_REVOKED_MESSAGE_TEXT,
        customerRevokedAt: revokedAt
      }
    });

    return { updated: true as const, messageId: target.id };
  }

  async ingestHumanMessage(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    agentPhone: string;
    businessPhone: string;
    customerPhone: string;
    text: string;
    externalId?: string | null;
    replyToMessageId?: string | null;
    quotedText?: string | null;
    quotedSenderType?: SenderType | null;
  }) {
    const message = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        customerId: input.customerId,
        direction: MessageDirection.OUTBOUND,
        senderType: SenderType.HUMAN,
        senderPhone: normalizePhone(input.agentPhone),
        receiverPhone: normalizePhone(input.customerPhone),
        contentText: input.text,
        aiGenerated: false,
        externalId: input.externalId ?? null,
        whatsappDeliveryStatus:
          input.externalId != null ? WhatsappDeliveryStatus.SENT : WhatsappDeliveryStatus.PENDING,
        replyToMessageId: input.replyToMessageId ?? null,
        quotedText: input.quotedText ?? null,
        quotedSenderType: input.quotedSenderType ?? null
      }
    });

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: new Date(),
        mode: ConversationMode.HUMAN,
        status: ConversationStatus.OPEN
      }
    });

    return message;
  }
}
