import {
  ConversationMode,
  ConversationStatus,
  MessageDirection,
  SenderType
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { NormalizedIncomingMessage } from "../../types/whatsapp.js";
import { normalizePhone } from "../../utils/phone.js";
import { usageEventsService, USAGE_EVENT_TYPES } from "../metrics/usage-events.service.js";
import { resolveReplyContext } from "./resolve-reply-context.js";

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
          message: existingFull
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

    return { customer, conversation, message: persistedMessage };
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
        externalId: input.externalId ?? null
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
      data: { externalId }
    });
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
