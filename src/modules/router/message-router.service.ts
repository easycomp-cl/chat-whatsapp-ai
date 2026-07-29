import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { responsePipelineService } from "../runtime/response-pipeline.service.js";
import { WhatsAppClient, WhatsAppSendError } from "../channel/whatsapp.client.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import { flowOrchestratorService } from "../flows/flow-orchestrator.service.js";
import { ContentType } from "@prisma/client";
import { messageMediaService } from "../conversations/message-media.service.js";
import type { NormalizedIncomingMessage } from "../../types/whatsapp.js";

export class MessageRouterService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly messageIngestService = new MessageIngestService(),
    private readonly whatsAppClient = new WhatsAppClient()
  ) {}

  async route(message: NormalizedIncomingMessage): Promise<void> {
    const resolved = await this.tenantResolver.resolveByChannel(
      message.toPhoneDisplay
        ? { phoneNumberId: message.toPhoneNumberId, displayPhone: message.toPhoneDisplay }
        : { phoneNumberId: message.toPhoneNumberId }
    );

    if (!resolved) {
      return;
    }

    const ingested = await this.messageIngestService.ingestCustomerMessage({
      tenantId: resolved.tenant.id,
      channelPhoneNumber: resolved.channel.phoneNumber,
      message,
      ...(message.media
        ? { contentType: message.media.type === "image" ? ContentType.IMAGE : ContentType.DOCUMENT }
        : {})
    });

    if (ingested.isDuplicate) {
      await this.retryPendingBotDelivery({
        conversationId: ingested.conversation.id,
        inboundCreatedAt: ingested.message.createdAt,
        customerPhone: ingested.customer.phoneNumber,
        phoneNumberId: resolved.channel.phoneNumberId,
        accessToken: resolved.accessToken
      });
      return;
    }

    if (message.media) {
      await messageMediaService.safeIngestInbound({
        tenantId: resolved.tenant.id,
        conversationId: ingested.conversation.id,
        messageId: ingested.message.id,
        accessToken: resolved.accessToken,
        media: message.media
      });
    }

    const flowResult = await flowOrchestratorService.handleInbound({
      tenantId: resolved.tenant.id,
      tenantName: resolved.tenant.name,
      conversationId: ingested.conversation.id,
      customerId: ingested.customer.id,
      customerPhone: ingested.customer.phoneNumber,
      customerName: ingested.customer.name,
      messageText: message.text,
      messageExternalId: message.externalMessageId,
      channelPhoneNumber: resolved.channel.phoneNumber,
      channelPhoneNumberId: resolved.channel.phoneNumberId,
      accessToken: resolved.accessToken,
      ...(resolved.tenant.config?.handoffMessage
        ? { handoffMessage: resolved.tenant.config.handoffMessage }
        : {}),
      ...(message.media ? { media: message.media } : {})
    });

    if (flowResult.handled) {
      for (const reply of flowResult.replies) {
        const outbound = await this.messageIngestService.ingestBotMessage({
          tenantId: resolved.tenant.id,
          conversationId: ingested.conversation.id,
          customerId: ingested.customer.id,
          botPhone: resolved.channel.phoneNumber,
          customerPhone: ingested.customer.phoneNumber,
          text: reply.text,
          aiGenerated: reply.aiGenerated ?? false
        });

        await this.sendBotReply({
          phoneNumberId: resolved.channel.phoneNumberId,
          accessToken: resolved.accessToken,
          to: ingested.customer.phoneNumber,
          text: reply.text,
          outboundMessageId: outbound.id
        });
      }
      return;
    }

    const result = await responsePipelineService.process({
      tenant: {
        id: resolved.tenant.id,
        name: resolved.tenant.name,
        botGlobalEnabled: resolved.tenant.botGlobalEnabled,
        defaultAiModel: resolved.tenant.defaultAiModel,
        confidenceThreshold: resolved.tenant.confidenceThreshold,
        config: resolved.tenant.config
          ? {
              botName: resolved.tenant.config.botName,
              botTone: resolved.tenant.config.botTone,
              greetingMessage: resolved.tenant.config.greetingMessage,
              handoffMessage: resolved.tenant.config.handoffMessage,
              configJson: resolved.tenant.config.configJson
            }
          : null
      },
      conversation: {
        id: ingested.conversation.id,
        mode: ingested.conversation.mode,
        botResumeAt: ingested.conversation.botResumeAt,
        channelPhoneNumber: resolved.channel.phoneNumber
      },
      customer: {
        id: ingested.customer.id,
        phoneNumber: ingested.customer.phoneNumber,
        name: ingested.customer.name,
        displayAlias: ingested.customer.displayAlias
      },
      incomingText: message.text,
      channel: {
        phoneNumberId: resolved.channel.phoneNumberId,
        accessToken: resolved.accessToken
      }
    });

    if (result.reply && result.outboundMessageId) {
      await this.sendBotReply({
        phoneNumberId: resolved.channel.phoneNumberId,
        accessToken: resolved.accessToken,
        to: ingested.customer.phoneNumber,
        text: result.reply,
        outboundMessageId: result.outboundMessageId
      });
    }
  }

  private async retryPendingBotDelivery(input: {
    conversationId: string;
    inboundCreatedAt: Date;
    customerPhone: string;
    phoneNumberId: string;
    accessToken: string;
  }) {
    const pending = await this.messageIngestService.findPendingBotOutbound({
      conversationId: input.conversationId,
      after: input.inboundCreatedAt
    });
    if (!pending?.contentText) {
      return;
    }

    await this.messageIngestService.markDeliveryPending(pending.id);

    await this.sendBotReply({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      to: input.customerPhone,
      text: pending.contentText,
      outboundMessageId: pending.id
    });
  }

  private async sendBotReply(input: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    text: string;
    outboundMessageId: string;
  }) {
    try {
      const wamid = await this.whatsAppClient.sendTextMessage({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        to: input.to,
        text: input.text
      });
      if (wamid) {
        await this.messageIngestService.setMessageExternalId(input.outboundMessageId, wamid);
      }
    } catch (error) {
      await this.messageIngestService.markDeliveryFailed(input.outboundMessageId);
      throw error;
    }
  }
}

export function isNonRetryableWhatsAppError(err: unknown): err is WhatsAppSendError {
  return err instanceof WhatsAppSendError && !err.isRetryable;
}
