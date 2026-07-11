import { prisma } from "../../lib/prisma.js";
import { normalizePhone } from "../../utils/phone.js";
import { encryptionService } from "../../lib/encryption.service.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

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
    // Solo en local: permite forzar token desde .env sin tocar la BD.
    if (
      env.NODE_ENV === "development" &&
      process.env.USE_ENV_WHATSAPP_TOKEN === "true" &&
      env.META_SYSTEM_USER_ACCESS_TOKEN
    ) {
      return env.META_SYSTEM_USER_ACCESS_TOKEN;
    }

    if (encrypted) {
      try {
        return encryptionService.decrypt(encrypted);
      } catch (error) {
        logger.error(
          { err: error },
          "No se pudo descifrar el token de WhatsApp del tenant; revisa ENCRYPTION_SECRET en AWS"
        );
      }
    }
    return env.META_SYSTEM_USER_ACCESS_TOKEN ?? "";
  }
}
