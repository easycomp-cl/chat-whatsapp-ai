import type {
  NormalizedIncomingEdit,
  NormalizedIncomingRevoke
} from "../../types/whatsapp.js";
import { logger } from "../../lib/logger.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";

export class MessageUpdateRouterService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly messageIngestService = new MessageIngestService()
  ) {}

  async routeEdit(edit: NormalizedIncomingEdit): Promise<void> {
    const resolved = await this.resolveTenant(edit);
    if (!resolved) {
      return;
    }

    const result = await this.messageIngestService.applyCustomerMessageEdit({
      tenantId: resolved.tenantId,
      originalMessageId: edit.originalMessageId,
      text: edit.text,
      editedAt: edit.timestamp
    });

    if (!result.updated && result.reason === "not_found") {
      logger.warn(
        {
          originalMessageId: edit.originalMessageId,
          editExternalId: edit.externalMessageId,
          fromPhone: edit.fromPhone
        },
        "Customer edit target message not found by externalId"
      );
    }
  }

  async routeRevoke(revoke: NormalizedIncomingRevoke): Promise<void> {
    const resolved = await this.resolveTenant(revoke);
    if (!resolved) {
      return;
    }

    const result = await this.messageIngestService.applyCustomerMessageRevoke({
      tenantId: resolved.tenantId,
      originalMessageId: revoke.originalMessageId,
      revokedAt: revoke.timestamp
    });

    if (!result.updated && result.reason === "not_found") {
      logger.warn(
        {
          originalMessageId: revoke.originalMessageId,
          revokeExternalId: revoke.externalMessageId,
          fromPhone: revoke.fromPhone
        },
        "Customer revoke target message not found by externalId"
      );
    }
  }

  private async resolveTenant(event: NormalizedIncomingEdit | NormalizedIncomingRevoke) {
    const resolved = await this.tenantResolver.resolveByChannel(
      event.toPhoneDisplay
        ? { phoneNumberId: event.toPhoneNumberId, displayPhone: event.toPhoneDisplay }
        : { phoneNumberId: event.toPhoneNumberId }
    );

    if (!resolved) {
      return null;
    }

    return { tenantId: resolved.tenant.id };
  }
}
