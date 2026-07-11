import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { paramId } from "../../utils/params.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import { WhatsAppClient, WhatsAppSendError } from "../channel/whatsapp.client.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { truncateQuotedText } from "../../utils/quoted-text.js";

const sendMessageSchema = z.object({
  text: z.string().min(1),
  agent_phone: z.string().optional(),
  reply_to_message_id: z.string().optional()
});

export async function sendConversationMessage(req: Request, res: Response) {
  const conversationId = paramId(req, "id");
  const body = sendMessageSchema.parse(req.body);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: true,
      tenant: {
        include: {
          channels: {
            where: { isActive: true, status: "ACTIVE" },
            take: 1
          }
        }
      }
    }
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const channel = conversation.tenant.channels[0];
  if (!channel) {
    res.status(400).json({ error: "No active WhatsApp channel for this business" });
    return;
  }

  let replyToExternalId: string | undefined;
  let replyToMessageId: string | null = null;
  let quotedText: string | null = null;
  let quotedSenderType = null as import("@prisma/client").SenderType | null;

  if (body.reply_to_message_id) {
    const parent = await prisma.message.findFirst({
      where: {
        id: body.reply_to_message_id,
        conversationId: conversation.id
      }
    });
    if (parent) {
      replyToMessageId = parent.id;
      quotedText = truncateQuotedText(parent.contentText);
      quotedSenderType = parent.senderType;
      if (parent.externalId) {
        replyToExternalId = parent.externalId;
      }
    }
  }

  const tenantResolver = new TenantResolverService();
  const accessToken = tenantResolver.resolveAccessToken(channel.accessTokenEncrypted);
  const whatsAppClient = new WhatsAppClient();
  const messageIngest = new MessageIngestService();

  const agentPhone = body.agent_phone ?? conversation.channelPhoneNumber;

  let wamid: string | null = null;
  try {
    wamid = await whatsAppClient.sendTextMessage({
      phoneNumberId: channel.phoneNumberId,
      accessToken,
      to: conversation.customer.phoneNumber,
      text: body.text,
      ...(replyToExternalId ? { replyToExternalId } : {})
    });
  } catch (error) {
    if (error instanceof WhatsAppSendError) {
      res.status(error.isTokenExpired ? 503 : 502).json({
        error: error.message,
        action: error.action,
        token_expired: error.isTokenExpired
      });
      return;
    }
    throw error;
  }

  const message = await messageIngest.ingestHumanMessage({
    tenantId: conversation.tenantId,
    conversationId: conversation.id,
    customerId: conversation.customerId,
    agentPhone,
    businessPhone: conversation.channelPhoneNumber,
    customerPhone: conversation.customer.phoneNumber,
    text: body.text,
    externalId: wamid,
    replyToMessageId,
    quotedText,
    quotedSenderType
  });

  res.status(201).json({
    id: message.id,
    conversation_id: message.conversationId,
    direction: message.direction,
    sender_type: message.senderType,
    content_text: message.contentText,
    external_id: message.externalId,
    reply_to_message_id: message.replyToMessageId,
    quoted_text: message.quotedText,
    quoted_sender_type: message.quotedSenderType,
    created_at: message.createdAt
  });
}
