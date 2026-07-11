import { prisma } from "../../lib/prisma.js";
import { normalizePhone } from "../../utils/phone.js";
import { encryptionService } from "../../lib/encryption.service.js";
import { env } from "../../config/env.js";

export class TenantResolverService {
  async resolveByChannel(input: { phoneNumberId: string; displayPhone?: string }) {
    const channel = await prisma.tenantChannel.findFirst({
      where: {
        isActive: true,
        status: "ACTIVE",
        OR: input.displayPhone
          ? [
              { phoneNumberId: input.phoneNumberId },
              { phoneNumber: normalizePhone(input.displayPhone) }
            ]
          : [{ phoneNumberId: input.phoneNumberId }]
      },
      include: {
        tenant: {
          include: {
            admins: { where: { isActive: true } },
            config: true
          }
        }
      }
    });

    if (!channel) {
      return null;
    }

    const accessToken = this.resolveAccessToken(channel.accessTokenEncrypted);

    return {
      channel,
      tenant: channel.tenant,
      accessToken
    };
  }

  resolveAccessToken(encrypted?: string | null): string {
    // En desarrollo, .env manda para no quedar con token viejo cifrado en BD.
    if (env.NODE_ENV === "development" && env.META_SYSTEM_USER_ACCESS_TOKEN) {
      return env.META_SYSTEM_USER_ACCESS_TOKEN;
    }

    if (encrypted) {
      try {
        return encryptionService.decrypt(encrypted);
      } catch {
        // fall through to system token
      }
    }
    return env.META_SYSTEM_USER_ACCESS_TOKEN ?? "";
  }
}
