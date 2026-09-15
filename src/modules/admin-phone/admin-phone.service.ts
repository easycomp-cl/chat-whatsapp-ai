import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import {
  STANDARD_TEMPLATE_LANGUAGE,
  buildSendTemplateComponents,
  getStandardTemplate
} from "../whatsapp-templates/standard-template-pack.js";
import { adminPhoneError } from "./admin-phone.errors.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_WINDOW_MS = 60 * 1000;
const OTP_MAX_PER_HOUR = 5;
const AUTH_TEMPLATE_NAME = "verificar_responsable_es";

function hashOtp(phone: string, code: string): string {
  return createHash("sha256").update(`${env.ENCRYPTION_SECRET}:${phone}:${code}`).digest("hex");
}

function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class AdminPhoneService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly whatsAppClient = new WhatsAppClient()
  ) {}

  async sendVerification(tenantId: string, phone: string) {
    const tenantExists = await requireTenantExists(tenantId);
    if (!tenantExists) {
      throw adminPhoneError("tenant_not_found", "No existe el negocio indicado.", 404);
    }

    const channel = await this.requireActiveChannel(tenantId);
    const template = await prisma.whatsappTemplate.findUnique({
      where: {
        tenantId_name_language: {
          tenantId,
          name: AUTH_TEMPLATE_NAME,
          language: STANDARD_TEMPLATE_LANGUAGE
        }
      }
    });

    if (!template || template.status !== "APPROVED") {
      throw adminPhoneError(
        "template_not_approved",
        "Conecta WhatsApp y espera la aprobación de la plantilla de verificación antes de enviar el código.",
        409
      );
    }

    const now = Date.now();
    const latest = await prisma.adminPhoneVerification.findFirst({
      where: { tenantId, phoneNumber: phone },
      orderBy: { createdAt: "desc" }
    });
    if (latest && now - latest.createdAt.getTime() < OTP_RESEND_WINDOW_MS) {
      throw adminPhoneError(
        "too_many_requests",
        "Espera un minuto antes de pedir otro código.",
        429
      );
    }

    const hourCount = await prisma.adminPhoneVerification.count({
      where: {
        tenantId,
        phoneNumber: phone,
        createdAt: { gte: new Date(now - 60 * 60 * 1000) }
      }
    });
    if (hourCount >= OTP_MAX_PER_HOUR) {
      throw adminPhoneError(
        "too_many_requests",
        "Demasiados intentos. Espera una hora e inténtalo de nuevo.",
        429
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const definition = getStandardTemplate(AUTH_TEMPLATE_NAME);
    const components = buildSendTemplateComponents({
      ...(definition ? { definition } : {}),
      bodyParameters: [code]
    });

    await this.whatsAppClient.sendTemplateMessage({
      phoneNumberId: channel.phoneNumberId,
      accessToken: channel.accessToken,
      to: phone,
      templateName: AUTH_TEMPLATE_NAME,
      languageCode: STANDARD_TEMPLATE_LANGUAGE,
      components
    });

    await prisma.adminPhoneVerification.create({
      data: {
        tenantId,
        phoneNumber: phone,
        codeHash: hashOtp(phone, code),
        expiresAt: new Date(now + OTP_TTL_MS)
      }
    });

    return {
      ok: true as const,
      expires_in_sec: Math.floor(OTP_TTL_MS / 1000),
      phone
    };
  }

  async confirmVerification(tenantId: string, phone: string, code: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, metadataJson: true }
    });
    if (!tenant) {
      throw adminPhoneError("tenant_not_found", "No existe el negocio indicado.", 404);
    }

    const latest = await prisma.adminPhoneVerification.findFirst({
      where: { tenantId, phoneNumber: phone, consumedAt: null },
      orderBy: { createdAt: "desc" }
    });

    if (!latest || latest.expiresAt.getTime() < Date.now()) {
      throw adminPhoneError("invalid_code", "El código es inválido o ya venció.", 400);
    }

    if (!hashesEqual(latest.codeHash, hashOtp(phone, code))) {
      throw adminPhoneError("invalid_code", "El código es inválido o ya venció.", 400);
    }

    const verifiedAt = new Date();
    const existingAdmin = await prisma.tenantAdmin.findUnique({
      where: {
        tenantId_phoneNumber: { tenantId, phoneNumber: phone }
      }
    });

    await prisma.$transaction(async (tx) => {
      await tx.adminPhoneVerification.update({
        where: { id: latest.id },
        data: { consumedAt: verifiedAt }
      });

      if (existingAdmin) {
        await tx.tenantAdmin.update({
          where: { id: existingAdmin.id },
          data: { phoneVerifiedAt: verifiedAt, isActive: true }
        });
      } else {
        const hasPrimary = await tx.tenantAdmin.findFirst({
          where: { tenantId, isPrimary: true },
          select: { id: true }
        });
        await tx.tenantAdmin.create({
          data: {
            tenantId,
            name: "Administrador",
            phoneNumber: phone,
            isPrimary: !hasPrimary,
            notifyOnHandoff: true,
            phoneVerifiedAt: verifiedAt
          }
        });
      }

      await this.persistVerifiedAtInDraft(tx, tenantId, tenant.metadataJson, phone, verifiedAt);
    });

    return {
      ok: true as const,
      verified_at: verifiedAt.toISOString()
    };
  }

  private async persistVerifiedAtInDraft(
    tx: Prisma.TransactionClient,
    tenantId: string,
    metadataJson: Prisma.JsonValue | null,
    phone: string,
    verifiedAt: Date
  ) {
    const record =
      metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)
        ? { ...(metadataJson as Record<string, unknown>) }
        : {};
    const setup =
      record.setup && typeof record.setup === "object" && !Array.isArray(record.setup)
        ? { ...(record.setup as Record<string, unknown>) }
        : {};
    const draft =
      setup.draft && typeof setup.draft === "object" && !Array.isArray(setup.draft)
        ? { ...(setup.draft as Record<string, unknown>) }
        : {};
    const humanContact =
      draft.human_contact && typeof draft.human_contact === "object" && !Array.isArray(draft.human_contact)
        ? { ...(draft.human_contact as Record<string, unknown>) }
        : {};

    setup.draft = {
      ...draft,
      human_contact: {
        ...humanContact,
        admin_phone: phone,
        admin_phone_verified_at: verifiedAt.toISOString()
      }
    };
    record.setup = setup;

    await tx.tenant.update({
      where: { id: tenantId },
      data: { metadataJson: record as Prisma.InputJsonValue }
    });
  }

  private async requireActiveChannel(tenantId: string) {
    const channel = await prisma.tenantChannel.findUnique({
      where: {
        tenantId_channelType: {
          tenantId,
          channelType: "WHATSAPP_BUSINESS"
        }
      }
    });
    if (!channel || !channel.isActive || channel.status !== "ACTIVE") {
      throw adminPhoneError(
        "not_connected",
        "Conecta WhatsApp del negocio antes de enviar el código de verificación.",
        409
      );
    }
    const accessToken = this.tenantResolver.resolveAccessToken(channel.accessTokenEncrypted);
    if (!accessToken) {
      throw adminPhoneError(
        "token_expired",
        "El token de WhatsApp expiró. Vuelve a conectar el canal.",
        503
      );
    }
    return { ...channel, accessToken };
  }
}

export const adminPhoneService = new AdminPhoneService();
