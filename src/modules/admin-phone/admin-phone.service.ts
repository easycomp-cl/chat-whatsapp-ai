import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { persistOnboardingDraftState } from "../onboarding/onboarding-draft.store.js";
import { mergeOnboardingDraft, parseSetupMetadata } from "../onboarding/setup-status.service.js";
import {
  STANDARD_TEMPLATE_LANGUAGE,
  buildSendTemplateComponents,
  getStandardTemplate
} from "../whatsapp-templates/standard-template-pack.js";
import { adminPhoneError } from "./admin-phone.errors.js";

const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_WINDOW_MS = 60 * 1000;
const MAX_PER_HOUR = 5;
const VERIFY_TEMPLATE_NAME = "verificar_responsable_es";

function hashToken(token: string): string {
  return createHash("sha256").update(`${env.ENCRYPTION_SECRET}:verify-phone:${token}`).digest("hex");
}

function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length < 7) return "****";
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

function publicStatus(row: { consumedAt: Date | null; expiresAt: Date }) {
  if (row.consumedAt) return "used" as const;
  if (row.expiresAt.getTime() < Date.now()) return "expired" as const;
  return "pending" as const;
}

export class AdminPhoneService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly whatsAppClient = new WhatsAppClient()
  ) {}

  async sendVerification(tenantId: string, phone: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { admins: { where: { phoneNumber: phone }, take: 1 } }
    });
    if (!tenant) {
      throw adminPhoneError("tenant_not_found", "No existe el negocio indicado.", 404);
    }

    const channel = await this.requireActiveChannel(tenantId);
    const template = await prisma.whatsappTemplate.findUnique({
      where: {
        tenantId_name_language: {
          tenantId,
          name: VERIFY_TEMPLATE_NAME,
          language: STANDARD_TEMPLATE_LANGUAGE
        }
      }
    });

    if (!template || template.status !== "APPROVED") {
      throw adminPhoneError(
        "template_not_approved",
        "Conecta WhatsApp y espera la aprobación de la plantilla de confirmación antes de enviarla.",
        409
      );
    }

    const now = Date.now();
    const latest = await prisma.adminPhoneVerification.findFirst({
      where: { tenantId, phoneNumber: phone },
      orderBy: { createdAt: "desc" }
    });
    if (latest && now - latest.createdAt.getTime() < RESEND_WINDOW_MS) {
      throw adminPhoneError(
        "too_many_requests",
        "Espera un minuto antes de enviar otra confirmación.",
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
    if (hourCount >= MAX_PER_HOUR) {
      throw adminPhoneError(
        "too_many_requests",
        "Demasiados intentos. Espera una hora e inténtalo de nuevo.",
        429
      );
    }

    const setup = parseSetupMetadata(tenant.metadataJson);
    const recipientName =
      tenant.admins[0]?.name?.trim() ||
      setup.draft.human_contact?.admin_name?.trim() ||
      "equipo";
    const token = randomBytes(12).toString("hex");
    const definition = getStandardTemplate(VERIFY_TEMPLATE_NAME);
    const components = buildSendTemplateComponents({
      ...(definition ? { definition } : {}),
      bodyParameters: [recipientName, tenant.name],
      buttonParameters: [token]
    });

    await this.whatsAppClient.sendTemplateMessage({
      phoneNumberId: channel.phoneNumberId,
      accessToken: channel.accessToken,
      to: phone,
      templateName: VERIFY_TEMPLATE_NAME,
      languageCode: STANDARD_TEMPLATE_LANGUAGE,
      components
    });

    await prisma.adminPhoneVerification.create({
      data: {
        tenantId,
        phoneNumber: phone,
        codeHash: hashToken(token),
        expiresAt: new Date(now + LINK_TTL_MS)
      }
    });

    return {
      ok: true as const,
      expires_in_sec: Math.floor(LINK_TTL_MS / 1000),
      phone
    };
  }

  async getPublicByToken(token: string) {
    const row = await this.findByToken(token);
    if (!row) {
      return {
        ok: true as const,
        found: false,
        status: "invalid" as const,
        business_name: null,
        phone_masked: null
      };
    }

    return {
      ok: true as const,
      found: true,
      status: publicStatus(row),
      business_name: row.tenant.name,
      phone_masked: maskPhone(row.phoneNumber)
    };
  }

  async confirmByToken(token: string) {
    const row = await this.findByToken(token);
    if (!row) {
      throw adminPhoneError("invalid_code", "Este enlace no es válido.", 400);
    }
    if (row.consumedAt) {
      throw adminPhoneError("invalid_code", "Este enlace ya fue usado.", 400);
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw adminPhoneError("invalid_code", "Este enlace ya venció. Pide otra confirmación.", 400);
    }

    return this.markVerified(row.tenantId, row.phoneNumber, row.id);
  }

  async confirmVerification(tenantId: string, phone: string, code: string) {
    const latest = await prisma.adminPhoneVerification.findFirst({
      where: { tenantId, phoneNumber: phone, consumedAt: null },
      orderBy: { createdAt: "desc" }
    });

    if (!latest || latest.expiresAt.getTime() < Date.now()) {
      throw adminPhoneError("invalid_code", "El enlace es inválido o ya venció.", 400);
    }

    if (!hashesEqual(latest.codeHash, hashToken(code))) {
      throw adminPhoneError("invalid_code", "El enlace es inválido o ya venció.", 400);
    }

    return this.markVerified(tenantId, phone, latest.id);
  }

  private async findByToken(token: string) {
    const normalized = token.trim().toLowerCase();
    if (!/^[a-z0-9]{8,64}$/.test(normalized)) return null;
    return prisma.adminPhoneVerification.findFirst({
      where: { codeHash: hashToken(normalized) },
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  private async markVerified(tenantId: string, phone: string, verificationId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, metadataJson: true, onboardingDraft: true }
    });
    if (!tenant) {
      throw adminPhoneError("tenant_not_found", "No existe el negocio indicado.", 404);
    }

    const verifiedAt = new Date();
    const existingAdmin = await prisma.tenantAdmin.findUnique({
      where: {
        tenantId_phoneNumber: { tenantId, phoneNumber: phone }
      }
    });

    await prisma.$transaction(async (tx) => {
      await tx.adminPhoneVerification.update({
        where: { id: verificationId },
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

      await this.persistVerifiedAtInDraft(tx, tenant, phone, verifiedAt);
    });

    return {
      ok: true as const,
      verified_at: verifiedAt.toISOString()
    };
  }

  private async persistVerifiedAtInDraft(
    tx: Prisma.TransactionClient,
    tenant: {
      id: string;
      metadataJson: Prisma.JsonValue | null;
      onboardingDraft: {
        currentStep: number;
        draftJson: Prisma.JsonValue;
      } | null;
    },
    phone: string,
    verifiedAt: Date
  ) {
    const setup = parseSetupMetadata(tenant.metadataJson);
    const storedDraft =
      tenant.onboardingDraft && typeof tenant.onboardingDraft.draftJson === "object" && tenant.onboardingDraft.draftJson
        ? (tenant.onboardingDraft.draftJson as Parameters<typeof mergeOnboardingDraft>[0])
        : setup.draft;
    const nextDraft = mergeOnboardingDraft(storedDraft, {
      human_contact: {
        admin_phone: phone,
        admin_phone_verified_at: verifiedAt.toISOString()
      }
    });

    await persistOnboardingDraftState(tx, {
      tenantId: tenant.id,
      metadataJson: tenant.metadataJson,
      setup,
      draft: nextDraft,
      currentStep: tenant.onboardingDraft?.currentStep ?? setup.current_step ?? 1
    });
  }

  private async requireActiveChannel(tenantId: string) {
    const exists = await requireTenantExists(tenantId);
    if (!exists) {
      throw adminPhoneError("tenant_not_found", "No existe el negocio indicado.", 404);
    }
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
        "Conecta WhatsApp del negocio antes de enviar la confirmación.",
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
