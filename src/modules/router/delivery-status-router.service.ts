import type { NormalizedMessageStatus } from "../../types/whatsapp.js";
import { logger } from "../../lib/logger.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { mapMetaStatusToWhatsappDeliveryStatus } from "../../utils/whatsapp-delivery-status.js";

export class DeliveryStatusRouterService {
  constructor(private readonly messageIngestService = new MessageIngestService()) {}

  async route(status: NormalizedMessageStatus): Promise<void> {
    const mapped = mapMetaStatusToWhatsappDeliveryStatus(status.status);
    if (!mapped) {
      return;
    }

    const result = await this.messageIngestService.applyOutboundDeliveryStatus({
      externalMessageId: status.externalMessageId,
      status: mapped
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
