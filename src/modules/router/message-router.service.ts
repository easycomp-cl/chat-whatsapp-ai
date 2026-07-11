import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { responsePipelineService } from "../runtime/response-pipeline.service.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
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

    if (result.reply) {
      const wamid = await this.whatsAppClient.sendTextMessage({
        phoneNumberId: resolved.channel.phoneNumberId,
        accessToken: resolved.accessToken,
        to: ingested.customer.phoneNumber,
        text: result.reply
      });
      if (wamid && result.outboundMessageId) {
        await this.messageIngestService.setMessageExternalId(result.outboundMessageId, wamid);
      }
    }
  }
}
