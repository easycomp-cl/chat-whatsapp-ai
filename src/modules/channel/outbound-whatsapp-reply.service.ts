import { ContentType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { WhatsAppClient, WhatsAppSendError } from "./whatsapp.client.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { parseGraphApiErrorBody } from "../../utils/whatsapp-delivery-error.js";
import type { OutboundInteractiveMessage } from "../../utils/whatsapp-interactive.js";

export type OutboundWhatsAppReply = {
  text: string;
  aiGenerated?: boolean;
  interactive?: OutboundInteractiveMessage;
};

export class OutboundWhatsAppReplyService {
  constructor(
    private readonly whatsAppClient = new WhatsAppClient(),
    private readonly messageIngestService = new MessageIngestService()
  ) {}

  async deliverBotReply(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    botPhone: string;
    customerPhone: string;
    phoneNumberId: string;
    accessToken: string;
    reply: OutboundWhatsAppReply;
    outboundMessageId?: string;
  }): Promise<{ messageId: string; externalId: string | null }> {
    const outbound =
      input.outboundMessageId != null
        ? { id: input.outboundMessageId }
        : await this.messageIngestService.ingestBotMessage({
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            customerId: input.customerId,
            botPhone: input.botPhone,
            customerPhone: input.customerPhone,
            text: input.reply.text,
            aiGenerated: input.reply.aiGenerated ?? false,
            contentType: input.reply.interactive ? ContentType.INTERACTIVE : ContentType.TEXT,
            ...(input.reply.interactive
              ? {
                  rawPayloadJson: {
                    outbound: { interactive: input.reply.interactive }
                  } as Prisma.InputJsonValue
                }
              : {})
          });

    try {
      const wamid = await this.sendToWhatsApp({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        to: input.customerPhone,
        reply: input.reply
      });

      if (wamid) {
        await this.messageIngestService.setMessageExternalId(outbound.id, wamid);
      }

      return { messageId: outbound.id, externalId: wamid };
    } catch (error) {
      const deliveryError =
        error instanceof WhatsAppSendError ? parseGraphApiErrorBody(error.body) : undefined;
      await this.messageIngestService.markDeliveryFailed(outbound.id, deliveryError);
      throw error;
    }
  }

  private async sendToWhatsApp(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    reply: OutboundWhatsAppReply;
  }): Promise<string | null> {
    if (input.reply.interactive?.type === "button") {
      return this.whatsAppClient.sendInteractiveButtonMessage({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        to: input.to,
        body: input.reply.interactive.body,
        buttons: input.reply.interactive.buttons
      });
    }

    if (input.reply.interactive?.type === "list") {
      return this.whatsAppClient.sendInteractiveListMessage({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        to: input.to,
        body: input.reply.interactive.body,
        buttonText: input.reply.interactive.buttonText,
        sections: input.reply.interactive.sections
      });
    }

    return this.whatsAppClient.sendTextMessage({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      to: input.to,
      text: input.reply.text
    });
  }
}

export const outboundWhatsAppReplyService = new OutboundWhatsAppReplyService();
