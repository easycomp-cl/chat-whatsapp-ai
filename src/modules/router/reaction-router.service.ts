import type { NormalizedIncomingReaction } from "../../types/whatsapp.js";
import { reactionIngestService } from "../conversations/reaction-ingest.service.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";

export class ReactionRouterService {
  constructor(private readonly tenantResolver = new TenantResolverService()) {}

  async route(reaction: NormalizedIncomingReaction): Promise<void> {
    const resolved = await this.tenantResolver.resolveByChannel(
      reaction.toPhoneDisplay
        ? { phoneNumberId: reaction.toPhoneNumberId, displayPhone: reaction.toPhoneDisplay }
        : { phoneNumberId: reaction.toPhoneNumberId }
    );

    if (!resolved) {
      return;
    }

    await reactionIngestService.ingestCustomerReaction({
      tenantId: resolved.tenant.id,
      reaction
    });
  }
}
