import { ContentType, ConversationStatus, MessageDirection, Prisma, SenderType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import type { SystemEventPayload } from "./system-event.types.js";

export class SystemEventPersistError extends Error {
  constructor(message = "No se pudo guardar el evento de sistema") {
    super(message);
    this.name = "SystemEventPersistError";
  }
}

export class ConversationNotForCustomerError extends Error {
  constructor(message = "La conversación no pertenece a este contacto") {
    super(message);
    this.name = "ConversationNotForCustomerError";
  }
}

type SystemEventDb = Prisma.TransactionClient | typeof prisma;

export class SystemEventService {
  async append(
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
      customerPhone: string;
      event: SystemEventPayload;
    },
    db: SystemEventDb = prisma
  ) {
    const body = input.event.body.trim();
    const title = input.event.title.trim();
    if (!body || !title) {
      throw new SystemEventPersistError("El evento de sistema no tiene título o cuerpo");
    }

    const actor = input.event.actor === "HUMAN" ? "HUMAN" : "BOT";
    const appearance = input.event.appearance === "dark_card" ? "dark_card" : "blue_pill";
    const rawPayloadJson = {
      system_event: {
        kind: input.event.kind,
        actor,
        appearance,
        title,
        body,
        payload: input.event.payload ?? { actor, appearance }
      }
    } as Prisma.InputJsonValue;

    try {
      return await db.message.create({
        data: {
          conversationId: input.conversationId,
          tenantId: input.tenantId,
          customerId: input.customerId,
          direction: MessageDirection.OUTBOUND,
          senderType: SenderType.SYSTEM,
          senderPhone: "system",
          receiverPhone: input.customerPhone,
          contentText: `${title}: ${body}`,
          contentType: ContentType.SYSTEM_EVENT,
          aiGenerated: false,
          rawPayloadJson
        }
      });
    } catch (error) {
      logger.error({ err: error, conversationId: input.conversationId }, "Failed to append system event");
      throw new SystemEventPersistError();
    }
  }

  async appendForConversation(
    conversationId: string,
    event: SystemEventPayload,
    db: SystemEventDb = prisma
  ) {
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        customer: { select: { phoneNumber: true } }
      }
    });
    if (!conversation) {
      throw new SystemEventPersistError("Conversation not found");
    }
    return this.append(
      {
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        customerId: conversation.customerId,
        customerPhone: conversation.customer.phoneNumber,
        event
      },
      db
    );
  }

  async appendSafe(
    input: {
      tenantId: string;
      conversationId: string;
      customerId: string;
      customerPhone: string;
      event: SystemEventPayload;
    },
    db: SystemEventDb = prisma
  ) {
    try {
      return await this.append(input, db);
    } catch (error) {
      logger.error({ err: error, conversationId: input.conversationId }, "System event skipped");
      return null;
    }
  }

  async appendForConversationSafe(conversationId: string, event: SystemEventPayload) {
    try {
      return await this.appendForConversation(conversationId, event);
    } catch (error) {
      logger.error({ err: error, conversationId }, "System event skipped");
      return null;
    }
  }

  async resolveConversationForCustomer(input: {
    tenantId: string;
    customerId: string;
    conversationId?: string;
  }) {
    if (input.conversationId) {
      return prisma.conversation.findFirst({
        where: {
          id: input.conversationId,
          tenantId: input.tenantId,
          customerId: input.customerId
        },
        select: { id: true }
      });
    }

    const open = await prisma.conversation.findFirst({
      where: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        status: ConversationStatus.OPEN
      },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true }
    });
    if (open) return open;

    return prisma.conversation.findFirst({
      where: { tenantId: input.tenantId, customerId: input.customerId },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true }
    });
  }
}

export const systemEventService = new SystemEventService();
