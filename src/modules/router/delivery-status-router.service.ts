import type { NormalizedMessageStatus } from "../../types/whatsapp.js";
import { WhatsappDeliveryStatus } from "@prisma/client";
import { logger } from "../../lib/logger.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { classifyWhatsappDeliveryError } from "../../utils/whatsapp-delivery-error.js";
import { mapMetaStatusToWhatsappDeliveryStatus } from "../../utils/whatsapp-delivery-status.js";

export class DeliveryStatusRouterService {
  constructor(private readonly messageIngestService = new MessageIngestService()) {}

  async route(status: NormalizedMessageStatus): Promise<void> {
    const mapped = mapMetaStatusToWhatsappDeliveryStatus(status.status);
    if (!mapped) {
      return;
    }

    if (mapped === WhatsappDeliveryStatus.FAILED && status.deliveryError) {
      logger.warn(
        {
          externalMessageId: status.externalMessageId,
          recipientPhone: status.recipientPhone,
          metaCode: status.deliveryError.code,
          kind: classifyWhatsappDeliveryError(
            status.deliveryError.code,
            `${status.deliveryError.title} ${status.deliveryError.message}`
          )
        },
        "WhatsApp outbound delivery failed"
      );
    }

    const result = await this.messageIngestService.applyOutboundDeliveryStatus({
      externalMessageId: status.externalMessageId,
      status: mapped,
      ...(status.deliveryError ? { deliveryError: status.deliveryError } : {})
    });

    if (!result.updated && result.reason === "not_found") {
      logger.debug(
        {
          externalMessageId: status.externalMessageId,
          metaStatus: status.status
        },
        "Outbound delivery status webhook without matching message"
      );
    }
  }
}
