import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { responsePipelineService } from "../runtime/response-pipeline.service.js";
import { WhatsAppClient, WhatsAppSendError } from "../channel/whatsapp.client.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
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
      message
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
        name: ingested.customer.name
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
