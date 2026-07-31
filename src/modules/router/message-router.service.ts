import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { responsePipelineService } from "../runtime/response-pipeline.service.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import { flowOrchestratorService } from "../flows/flow-orchestrator.service.js";
import { ContentType } from "@prisma/client";
import { messageMediaService } from "../conversations/message-media.service.js";
import { inboundAudioService } from "../conversations/inbound-audio.service.js";
import type { NormalizedIncomingMessage } from "../../types/whatsapp.js";
import { outboundWhatsAppReplyService } from "../channel/outbound-whatsapp-reply.service.js";
import { WhatsAppSendError } from "../channel/whatsapp.client.js";

function resolveInboundContentType(message: NormalizedIncomingMessage): ContentType | undefined {
  if (!message.media) return undefined;
  if (message.media.type === "image") return ContentType.IMAGE;
  if (message.media.type === "audio") return ContentType.AUDIO;
  return ContentType.DOCUMENT;
}

function resolvePipelineText(message: NormalizedIncomingMessage): string {
  if (message.interactiveSelection?.id) {
    return message.interactiveSelection.id;
  }

  return message.text;
}

export class MessageRouterService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly messageIngestService = new MessageIngestService()
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

    const contentType = resolveInboundContentType(message);
    const ingested = await this.messageIngestService.ingestCustomerMessage({
      tenantId: resolved.tenant.id,
      channelPhoneNumber: resolved.channel.phoneNumber,
      message,
      ...(contentType ? { contentType } : {})
    });

    if (ingested.isDuplicate) {
      await this.retryPendingBotDelivery({
        conversationId: ingested.conversation.id,
        inboundCreatedAt: ingested.message.createdAt,
        customerPhone: ingested.customer.phoneNumber,
        phoneNumberId: resolved.channel.phoneNumberId,
        accessToken: resolved.accessToken,
        tenantId: resolved.tenant.id,
        customerId: ingested.customer.id,
        botPhone: resolved.channel.phoneNumber
      });
      return;
    }

    let pipelineText = message.text;

    if (message.media?.type === "audio") {
      const audioResult = await inboundAudioService.process({
        tenantId: resolved.tenant.id,
        conversationId: ingested.conversation.id,
        messageId: ingested.message.id,
        accessToken: resolved.accessToken,
        media: message.media
      });
      pipelineText = audioResult.pipelineText;
    } else if (message.media) {
      await messageMediaService.safeIngestInbound({
        tenantId: resolved.tenant.id,
        conversationId: ingested.conversation.id,
        messageId: ingested.message.id,
        accessToken: resolved.accessToken,
        media: message.media
      });
    }

    pipelineText = resolvePipelineText({ ...message, text: pipelineText });

    const flowResult = await flowOrchestratorService.handleInbound({
      tenantId: resolved.tenant.id,
      tenantName: resolved.tenant.name,
      conversationId: ingested.conversation.id,
      customerId: ingested.customer.id,
      customerPhone: ingested.customer.phoneNumber,
      customerName: ingested.customer.name,
      messageText: pipelineText,
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
        await outboundWhatsAppReplyService.deliverBotReply({
          tenantId: resolved.tenant.id,
          conversationId: ingested.conversation.id,
          customerId: ingested.customer.id,
          botPhone: resolved.channel.phoneNumber,
          customerPhone: ingested.customer.phoneNumber,
          phoneNumberId: resolved.channel.phoneNumberId,
          accessToken: resolved.accessToken,
          reply
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
              fallbackMessage: resolved.tenant.config.fallbackMessage,
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
      incomingText: pipelineText,
      channel: {
        phoneNumberId: resolved.channel.phoneNumberId,
        accessToken: resolved.accessToken
      }
    });

    if (result.reply && result.outboundMessageId) {
      await outboundWhatsAppReplyService.deliverBotReply({
        tenantId: resolved.tenant.id,
        conversationId: ingested.conversation.id,
        customerId: ingested.customer.id,
        botPhone: resolved.channel.phoneNumber,
        customerPhone: ingested.customer.phoneNumber,
        phoneNumberId: resolved.channel.phoneNumberId,
        accessToken: resolved.accessToken,
        reply: { text: result.reply },
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
    tenantId: string;
    customerId: string;
    botPhone: string;
  }) {
    const pending = await this.messageIngestService.findPendingBotOutbound({
      conversationId: input.conversationId,
      after: input.inboundCreatedAt
    });
    if (!pending?.contentText) {
      return;
    }

    await this.messageIngestService.markDeliveryPending(pending.id);

    await outboundWhatsAppReplyService.deliverBotReply({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      botPhone: input.botPhone,
      customerPhone: input.customerPhone,
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      reply: { text: pending.contentText },
      outboundMessageId: pending.id
    });
  }
}

export function isNonRetryableWhatsAppError(err: unknown): err is WhatsAppSendError {
  return err instanceof WhatsAppSendError && !err.isRetryable;
}
