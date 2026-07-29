import { prisma } from "../../lib/prisma.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import type { FlowEngineReply } from "./flow-engine.service.js";
import { FlowHttpError } from "./flows.errors.js";

export class FlowDeliveryService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly messageIngestService = new MessageIngestService(),
    private readonly whatsAppClient = new WhatsAppClient()
  ) {}

  async deliverBotReplies(input: {
    tenantId: string;
    conversationId: string;
    replies: FlowEngineReply[];
  }): Promise<Array<{ messageId: string; externalId: string | null; text: string }>> {
    if (input.replies.length === 0) {
      return [];
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
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

    if (!conversation?.customer) {
      throw new FlowHttpError("Conversación no encontrada", 404);
    }

    const channel = conversation.tenant.channels[0];
    if (!channel) {
      throw new FlowHttpError("No hay canal WhatsApp activo", 400);
    }

    const accessToken = this.tenantResolver.resolveAccessToken(channel.accessTokenEncrypted);
    const sent: Array<{ messageId: string; externalId: string | null; text: string }> = [];

    for (const reply of input.replies) {
      const outbound = await this.messageIngestService.ingestBotMessage({
        tenantId: input.tenantId,
        conversationId: conversation.id,
        customerId: conversation.customerId,
        botPhone: channel.phoneNumber,
        customerPhone: conversation.customer.phoneNumber,
        text: reply.text,
        aiGenerated: reply.aiGenerated ?? false
      });

      const externalId = await this.whatsAppClient.sendTextMessage({
        phoneNumberId: channel.phoneNumberId,
        accessToken,
        to: conversation.customer.phoneNumber,
        text: reply.text
      });

      if (externalId) {
        await this.messageIngestService.setMessageExternalId(outbound.id, externalId);
      }

      sent.push({ messageId: outbound.id, externalId, text: reply.text });
    }

    return sent;
  }
}

export const flowDeliveryService = new FlowDeliveryService();
