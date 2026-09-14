import { Prisma, type TenantChannel } from "@prisma/client";
import { env } from "../../config/env.js";
import { encryptionService } from "../../lib/encryption.service.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import { MetaGraphClient } from "../meta/meta-graph.client.js";
import { connectionError, WhatsAppConnectionError } from "./whatsapp-connection.errors.js";
import type { EmbeddedSignupCompleteInput } from "./whatsapp-connection.schema.js";
import type { EmbeddedSignupCompleteResult, WhatsAppConnectionPublic } from "./whatsapp-connection.types.js";
import {
  hashAuthorizationCode,
  mapChannelToPublicStatus,
  normalizeDisplayPhone
} from "./whatsapp-connection.utils.js";

export { hashAuthorizationCode, mapChannelToPublicStatus, normalizeDisplayPhone } from "./whatsapp-connection.utils.js";

const SESSION_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TEST_MESSAGE = "Mensaje de prueba — EasyComp Chat Bot Manager";

function requireMetaAppConfig() {
  return {
    graphVersion: env.WHATSAPP_GRAPH_VERSION,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    ...(env.META_OAUTH_REDIRECT_URI ? { redirectUri: env.META_OAUTH_REDIRECT_URI } : {})
  };
}

function publicMeta() {
  return {
    app_id: env.META_APP_ID,
    config_id: env.META_EMBEDDED_SIGNUP_CONFIG_ID
  };
}

function serializeConnection(tenantId: string, channel: TenantChannel | null): WhatsAppConnectionPublic {
  const status = mapChannelToPublicStatus(channel);
  return {
    ok: true,
    connected: status === "connected",
    status,
    tenant_id: tenantId,
    phone_number_id: channel?.phoneNumberId ?? null,
    waba_id: channel?.wabaId ?? null,
    business_id: channel?.metaBusinessId ?? null,
    display_phone_number: channel?.phoneNumber ?? null,
    token_expires_at: channel?.tokenExpiresAt?.toISOString() ?? null,
    last_error: channel?.lastError ?? null,
    updated_at: channel?.updatedAt?.toISOString() ?? null,
    meta: publicMeta()
  };
}

export class WhatsAppConnectionService {
  constructor(
    private readonly graphClientFactory: (redirectUri?: string) => MetaGraphClient = (redirectUri) => {
      const config = requireMetaAppConfig();
      return new MetaGraphClient({
        graphVersion: config.graphVersion,
        appId: config.appId,
        appSecret: config.appSecret,
        ...(redirectUri ? { redirectUri } : config.redirectUri ? { redirectUri: config.redirectUri } : {})
      });
    },
    private readonly whatsAppClient = new WhatsAppClient()
  ) {}

  async getConnection(tenantId: string): Promise<WhatsAppConnectionPublic | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) return null;

    const channel = await prisma.tenantChannel.findUnique({
      where: {
        tenantId_channelType: {
          tenantId,
          channelType: "WHATSAPP_BUSINESS"
        }
      }
    });

    return serializeConnection(tenantId, channel);
  }

  async completeEmbeddedSignup(
    tenantId: string,
    input: EmbeddedSignupCompleteInput
  ): Promise<EmbeddedSignupCompleteResult> {
    requireMetaAppConfig();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true }
    });
    if (!tenant) {
      throw connectionError("tenant_not_found", "No existe el negocio indicado.", 404);
    }

    const codeHash = hashAuthorizationCode(input.code);
    const existingSession = await prisma.whatsAppConnectionSession.findUnique({
      where: { codeHash }
    });

    if (existingSession) {
      throw connectionError(
        "code_reused",
        "Ese código de autorización ya fue usado. Vuelve a conectar WhatsApp para obtener uno nuevo.",
        409
      );
    }

    const conflicting = await prisma.tenantChannel.findUnique({
      where: { phoneNumberId: input.phone_number_id }
    });
    if (conflicting && conflicting.tenantId !== tenantId) {
      throw connectionError(
        "phone_number_conflict",
        "Ese número de WhatsApp ya está conectado a otro negocio.",
        409
      );
    }

    let session;
    try {
      session = await prisma.whatsAppConnectionSession.create({
        data: {
          tenantId,
          status: "PENDING",
          codeHash,
          wabaId: input.waba_id,
          phoneNumberId: input.phone_number_id,
          ...(input.business_id ? { metaBusinessId: input.business_id } : {}),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS)
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw connectionError(
          "code_reused",
          "Ese código de autorización ya fue usado. Vuelve a conectar WhatsApp para obtener uno nuevo.",
          409
        );
      }
      throw error;
    }

    try {
      const graph = input.redirect_uri
        ? this.graphClientFactory(input.redirect_uri)
        : this.graphClientFactory();
      const shortLived = await graph.exchangeCodeForToken(input.code);
      const longLived = await graph.exchangeForLongLivedToken(shortLived.accessToken);
      const token = longLived ?? shortLived;

      await graph.subscribeWaba(input.waba_id, token.accessToken);

      await graph.registerPhoneNumber(input.phone_number_id, token.accessToken, input.pin);

      let displayPhone = "";
      let businessId = input.business_id ?? null;

      try {
        const phone = await graph.getPhoneNumber(input.phone_number_id, token.accessToken);
        displayPhone = normalizeDisplayPhone(phone.displayPhoneNumber);
      } catch (error) {
        logger.warn(
          { tenantId, phoneNumberId: input.phone_number_id, err: error },
          "No se pudo leer display_phone_number en Graph; se usará un placeholder"
        );
      }

      try {
        const waba = await graph.getWaba(input.waba_id, token.accessToken);
        businessId = businessId ?? waba.businessId ?? null;
      } catch (error) {
        logger.warn(
          { tenantId, wabaId: input.waba_id, err: error },
          "No se pudo leer business_id del WABA en Graph"
        );
      }

      if (!displayPhone) {
        displayPhone = `wa:${input.phone_number_id}`;
      }

      const expiresAt =
        typeof token.expiresIn === "number"
          ? new Date(Date.now() + token.expiresIn * 1000)
          : null;

      await this.upsertTenantChannel({
        tenantId,
        phoneNumberId: input.phone_number_id,
        phoneNumber: displayPhone,
        wabaId: input.waba_id,
        metaBusinessId: businessId,
        accessToken: token.accessToken,
        tokenExpiresAt: expiresAt
      });

      await prisma.whatsAppConnectionSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          phoneNumber: displayPhone,
          ...(businessId ? { metaBusinessId: businessId } : {}),
          lastError: null,
          completedAt: new Date()
        }
      });

      logger.info(
        {
          tenantId,
          wabaId: input.waba_id,
          phoneNumberId: input.phone_number_id
        },
        "WhatsApp Embedded Signup completed"
      );

      return {
        ok: true,
        phone_number_id: input.phone_number_id,
        waba_id: input.waba_id,
        business_id: businessId,
        display_phone_number: displayPhone,
        status: "connected"
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo completar la conexión de WhatsApp.";

      logger.warn(
        {
          tenantId,
          wabaId: input.waba_id,
          phoneNumberId: input.phone_number_id,
          errorCode: error instanceof WhatsAppConnectionError ? error.code : "unknown"
        },
        "WhatsApp Embedded Signup failed before persisting TenantChannel"
      );

      await prisma.whatsAppConnectionSession.update({
        where: { id: session.id },
        data: {
          status: "FAILED",
          lastError: message.slice(0, 500)
        }
      });

      await prisma.tenantChannel
        .updateMany({
          where: { tenantId, channelType: "WHATSAPP_BUSINESS", phoneNumberId: input.phone_number_id },
          data: {
            status: "INACTIVE",
            lastError: message.slice(0, 500)
          }
        })
        .catch(() => undefined);

      throw error;
    }
  }

  async upsertTenantChannel(input: {
    tenantId: string;
    phoneNumberId: string;
    phoneNumber: string;
    wabaId?: string | null;
    metaBusinessId?: string | null;
    accessToken: string;
    verifyToken?: string | null;
    coexistenceEnabled?: boolean;
    tokenExpiresAt?: Date | null;
  }): Promise<TenantChannel> {
    const existingByPhone = await prisma.tenantChannel.findUnique({
      where: { phoneNumberId: input.phoneNumberId }
    });
    if (existingByPhone && existingByPhone.tenantId !== input.tenantId) {
      throw connectionError(
        "phone_number_conflict",
        "Ese número de WhatsApp ya está conectado a otro negocio.",
        409
      );
    }

    const encrypted = encryptionService.encrypt(input.accessToken.trim());
    const data: Prisma.TenantChannelUncheckedUpdateInput = {
      phoneNumberId: input.phoneNumberId,
      phoneNumber: input.phoneNumber,
      accessTokenEncrypted: encrypted,
      status: "ACTIVE",
      isActive: true,
      lastError: null,
      ...(input.wabaId !== undefined ? { wabaId: input.wabaId } : {}),
      ...(input.metaBusinessId !== undefined ? { metaBusinessId: input.metaBusinessId } : {}),
      ...(input.verifyToken !== undefined ? { verifyToken: input.verifyToken } : {}),
      ...(input.coexistenceEnabled !== undefined
        ? { coexistenceEnabled: input.coexistenceEnabled }
        : {}),
      ...(input.tokenExpiresAt !== undefined ? { tokenExpiresAt: input.tokenExpiresAt } : {})
    };

    const existingByTenant = await prisma.tenantChannel.findUnique({
      where: {
        tenantId_channelType: {
          tenantId: input.tenantId,
          channelType: "WHATSAPP_BUSINESS"
        }
      }
    });

    if (existingByTenant) {
      return prisma.tenantChannel.update({
        where: { id: existingByTenant.id },
        data
      });
    }

    return prisma.tenantChannel.create({
      data: {
        tenantId: input.tenantId,
        phoneNumberId: input.phoneNumberId,
        phoneNumber: input.phoneNumber,
        accessTokenEncrypted: encrypted,
        status: "ACTIVE",
        isActive: true,
        lastError: null,
        ...(input.wabaId != null ? { wabaId: input.wabaId } : {}),
        ...(input.metaBusinessId != null ? { metaBusinessId: input.metaBusinessId } : {}),
        ...(input.verifyToken != null ? { verifyToken: input.verifyToken } : {}),
        ...(input.coexistenceEnabled !== undefined
          ? { coexistenceEnabled: input.coexistenceEnabled }
          : {}),
        ...(input.tokenExpiresAt ? { tokenExpiresAt: input.tokenExpiresAt } : {})
      }
    });
  }

  async sendTestMessage(input: { tenantId: string; to: string; text?: string }) {
    const channel = await prisma.tenantChannel.findUnique({
      where: {
        tenantId_channelType: {
          tenantId: input.tenantId,
          channelType: "WHATSAPP_BUSINESS"
        }
      }
    });

    if (!channel || !channel.isActive || channel.status !== "ACTIVE") {
      throw connectionError(
        "not_connected",
        "Este negocio aún no tiene un número de WhatsApp conectado.",
        409
      );
    }

    if (!channel.accessTokenEncrypted) {
      throw connectionError(
        "missing_channel_token",
        "El canal no tiene token de Embedded Signup. Vuelve a conectar WhatsApp.",
        409
      );
    }

    let accessToken: string;
    try {
      accessToken = encryptionService.decrypt(channel.accessTokenEncrypted);
    } catch {
      throw connectionError(
        "token_decrypt_failed",
        "No se pudo descifrar el token de WhatsApp del negocio. Revisa ENCRYPTION_SECRET.",
        500
      );
    }

    const to = normalizeDisplayPhone(input.to);
    const text = input.text?.trim() || DEFAULT_TEST_MESSAGE;
    const externalId = await this.whatsAppClient.sendTextMessage({
      phoneNumberId: channel.phoneNumberId,
      accessToken,
      to,
      text
    });

    return {
      ok: true as const,
      phone_number_id: channel.phoneNumberId,
      to,
      external_message_id: externalId
    };
  }
}

export const whatsappConnectionService = new WhatsAppConnectionService();
