import { ContentType, type TenantChannel, type WhatsappTemplate } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import {
  MetaGraphApiError,
  MetaGraphClient,
  type GraphMessageTemplate
} from "../meta/meta-graph.client.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { truncateQuotedText } from "../../utils/quoted-text.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { templateError } from "./whatsapp-templates.errors.js";
import {
  STANDARD_TEMPLATE_PACK,
  STANDARD_TEMPLATE_PACK_KEY,
  STANDARD_TEMPLATE_LANGUAGE,
  buildCreateTemplatePayload,
  buildSendTemplateComponents,
  getStandardTemplate,
  renderTemplateBody,
  type StandardTemplateDefinition
} from "./standard-template-pack.js";
import {
  extractBodyPreview,
  extractVariableCount,
  mapMetaTemplateStatus
} from "./whatsapp-templates.utils.js";
import type { SendConversationTemplateInput } from "./whatsapp-templates.schema.js";
import { paymentLinkService } from "../payments/payment-link.service.js";

const SYNC_TTL_MS = 10 * 60 * 1000;
const CREATE_ATTEMPTS = 3;

type ChannelWithToken = {
  channel: TenantChannel;
  accessToken: string;
};

export type PublicWhatsappTemplate = {
  name: string;
  language: string;
  category: string;
  status: string;
  quality: string | null;
  rejection_reason: string | null;
  body_preview: string;
  variable_count: number;
  parameter_fields: StandardTemplateDefinition["parameterFields"];
  in_pack: boolean;
  product_use: string | null;
  meta_template_id: string | null;
  last_error: string | null;
  updated_at: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function graphClient(): MetaGraphClient {
  return new MetaGraphClient({
    graphVersion: env.WHATSAPP_GRAPH_VERSION,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET
  });
}

export class WhatsappTemplatesService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly whatsAppClient = new WhatsAppClient(),
    private readonly messageIngest = new MessageIngestService()
  ) {}

  async listTemplates(tenantId: string, statusFilter?: string) {
    const tenantExists = await requireTenantExists(tenantId);
    if (!tenantExists) {
      throw templateError("tenant_not_found", "No existe el negocio indicado.", 404);
    }

    const channel = await this.getChannel(tenantId);
    if (channel?.channel.wabaId && channel.accessToken) {
      await this.syncFromMetaIfStale(tenantId, channel);
    }

    const rows = await prisma.whatsappTemplate.findMany({
      where: { tenantId },
      orderBy: [{ packKey: "asc" }, { name: "asc" }]
    });

    const byKey = new Map(rows.map((row) => [`${row.name}:${row.language}`, row]));
    const templates: PublicWhatsappTemplate[] = [];

    for (const definition of STANDARD_TEMPLATE_PACK) {
      const row = byKey.get(`${definition.name}:${definition.language}`);
      templates.push(this.serialize(definition, row ?? null));
      byKey.delete(`${definition.name}:${definition.language}`);
    }

    for (const row of byKey.values()) {
      templates.push(this.serialize(getStandardTemplate(row.name), row));
    }

    const wanted = statusFilter?.trim().toUpperCase();
    const filtered = wanted
      ? templates.filter((item) => item.status === wanted)
      : templates;

    return {
      templates: filtered,
      pack: STANDARD_TEMPLATE_PACK_KEY,
      connected: Boolean(channel?.channel.wabaId)
    };
  }

  async provisionDefaults(tenantId: string) {
    const tenantExists = await requireTenantExists(tenantId);
    if (!tenantExists) {
      throw templateError("tenant_not_found", "No existe el negocio indicado.", 404);
    }

    const channel = await this.requireChannelWithWaba(tenantId);
    const graph = graphClient();
    let existing: GraphMessageTemplate[] = [];
    try {
      existing = await graph.listMessageTemplates(channel.channel.wabaId!, channel.accessToken);
    } catch (error) {
      logger.warn({ tenantId, err: error }, "No se pudieron listar plantillas Meta antes de provisionar");
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const pending: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    for (const definition of STANDARD_TEMPLATE_PACK) {
      const already = existing.find(
        (item) => item.name === definition.name && item.language === definition.language
      );
      if (already) {
        await this.upsertFromMeta(tenantId, already, definition);
        skipped.push(definition.name);
        if (mapMetaTemplateStatus(already.status) === "PENDING") {
          pending.push(definition.name);
        }
        continue;
      }

      try {
        const result = await this.createWithRetry(
          graph,
          channel.channel.wabaId!,
          channel.accessToken,
          definition
        );
        await this.upsertLocal(tenantId, {
          name: definition.name,
          language: definition.language,
          category: result.category ?? definition.category,
          status: mapMetaTemplateStatus(result.status ?? "PENDING"),
          bodyPreview: definition.bodyPreview,
          variableCount: definition.parameterFields.filter((field) => field.component === "body")
            .length,
          packKey: STANDARD_TEMPLATE_PACK_KEY,
          lastError: null,
          ...(result.id ? { metaTemplateId: result.id } : {})
        });
        created.push(definition.name);
        pending.push(definition.name);
      } catch (error) {
        if (error instanceof MetaGraphApiError && error.isDuplicateTemplate) {
          skipped.push(definition.name);
          await this.upsertLocal(tenantId, {
            name: definition.name,
            language: definition.language,
            category: definition.category,
            status: "PENDING",
            bodyPreview: definition.bodyPreview,
            variableCount: definition.parameterFields.filter((field) => field.component === "body")
              .length,
            packKey: STANDARD_TEMPLATE_PACK_KEY,
            lastError: null
          });
          continue;
        }

        const message = error instanceof Error ? error.message : "Error desconocido";
        failed.push({ name: definition.name, error: message });
        await this.upsertLocal(tenantId, {
          name: definition.name,
          language: definition.language,
          category: definition.category,
          status: "NOT_CREATED",
          bodyPreview: definition.bodyPreview,
          variableCount: definition.parameterFields.filter((field) => field.component === "body")
            .length,
          packKey: STANDARD_TEMPLATE_PACK_KEY,
          lastError: message.slice(0, 500)
        });
        logger.warn(
          { tenantId, template: definition.name, err: error },
          "No se pudo crear plantilla del pack estándar"
        );
      }
    }

    return {
      pack: STANDARD_TEMPLATE_PACK_KEY,
      created,
      skipped,
      pending,
      failed
    };
  }

  async applyStatusUpdate(input: {
    wabaId: string;
    name: string;
    language: string;
    event: string;
    metaTemplateId?: string;
    reason?: string;
  }) {
    const channel = await prisma.tenantChannel.findFirst({
      where: { wabaId: input.wabaId, channelType: "WHATSAPP_BUSINESS" }
    });
    if (!channel) {
      logger.info({ wabaId: input.wabaId, name: input.name }, "Template status for unknown WABA");
      return { updated: false as const };
    }

    const definition = getStandardTemplate(input.name);
    const status = mapMetaTemplateStatus(input.event);
    const rejectionReason =
      status === "REJECTED" && input.reason && input.reason.toUpperCase() !== "NONE"
        ? input.reason
        : null;

    await this.upsertLocal(channel.tenantId, {
      name: input.name,
      language: input.language || STANDARD_TEMPLATE_LANGUAGE,
      category: definition?.category ?? "UTILITY",
      status,
      bodyPreview: definition?.bodyPreview ?? input.name,
      variableCount:
        definition?.parameterFields.filter((field) => field.component === "body").length ?? 0,
      ...(input.metaTemplateId ? { metaTemplateId: input.metaTemplateId } : {}),
      ...(definition ? { packKey: STANDARD_TEMPLATE_PACK_KEY } : {}),
      rejectionReason,
      lastError: null
    });

    logger.info(
      {
        tenantId: channel.tenantId,
        name: input.name,
        status
      },
      "WhatsApp template status updated"
    );

    return { updated: true as const, tenantId: channel.tenantId, status };
  }

  async sendConversationTemplate(conversationId: string, input: SendConversationTemplateInput) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        tenant: {
          include: {
            channels: {
              where: { isActive: true, status: "ACTIVE" },
              take: 1
            }
          }
        }
      }
    });

    if (!conversation) {
      throw templateError("conversation_not_found", "Conversación no encontrada.", 404);
    }

    const channel = conversation.tenant.channels[0];
    if (!channel) {
      throw templateError(
        "no_channel",
        "No hay un canal de WhatsApp activo para este negocio.",
        400
      );
    }

    const language = input.language_code ?? STANDARD_TEMPLATE_LANGUAGE;
    const local = await prisma.whatsappTemplate.findUnique({
      where: {
        tenantId_name_language: {
          tenantId: conversation.tenantId,
          name: input.template_name,
          language
        }
      }
    });

    const definition = getStandardTemplate(input.template_name);
    if (local && local.status !== "APPROVED") {
      throw templateError(
        "template_not_approved",
        `La plantilla ${input.template_name} no está aprobada (${local.status}).`,
        409
      );
    }

    const bodyParameters = input.body_parameters ?? [];
    let buttonParameters = input.button_parameters;

    if (input.template_name === "link_pago_es") {
      const ensured = await paymentLinkService.ensureForTemplateSend({
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        ...(buttonParameters?.[0] ? { requestedCode: buttonParameters[0] } : {}),
        ...(bodyParameters[1] ? { orderRef: bodyParameters[1] } : {})
      });
      buttonParameters = [ensured.code];
    }

    const expectedBodyVars =
      definition?.parameterFields.filter((field) => field.component === "body").length ??
      local?.variableCount ??
      0;
    if (
      !input.components?.length &&
      expectedBodyVars > 0 &&
      bodyParameters.length !== expectedBodyVars
    ) {
      throw templateError(
        "parameter_mismatch",
        `La plantilla espera ${expectedBodyVars} variables de cuerpo y recibiste ${bodyParameters.length}.`,
        400
      );
    }

    const sendComponents =
      input.components?.map((component) => ({
        type: component.type,
        ...(component.sub_type ? { sub_type: component.sub_type } : {}),
        ...(component.index !== undefined ? { index: String(component.index) } : {}),
        ...(component.parameters ? { parameters: component.parameters } : {})
      })) ??
      buildSendTemplateComponents({
        ...(definition ? { definition } : {}),
        bodyParameters,
        ...(buttonParameters ? { buttonParameters } : {})
      });

    const previewSource = definition?.bodyText ?? local?.bodyPreview ?? input.template_name;
    const contentText = renderTemplateBody(previewSource, bodyParameters);

    let replyToExternalId: string | undefined;
    let replyToMessageId: string | null = null;
    let quotedText: string | null = null;
    let quotedSenderType = null as import("@prisma/client").SenderType | null;

    if (input.reply_to_message_id) {
      const parent = await prisma.message.findFirst({
        where: { id: input.reply_to_message_id, conversationId: conversation.id }
      });
      if (parent) {
        replyToMessageId = parent.id;
        quotedText = truncateQuotedText(parent.contentText);
        quotedSenderType = parent.senderType;
        if (parent.externalId) replyToExternalId = parent.externalId;
      }
    }

    const accessToken = this.tenantResolver.resolveAccessToken(channel.accessTokenEncrypted);
    const wamid = await this.whatsAppClient.sendTemplateMessage({
      phoneNumberId: channel.phoneNumberId,
      accessToken,
      to: conversation.customer.phoneNumber,
      templateName: input.template_name,
      languageCode: language,
      components: sendComponents,
      ...(replyToExternalId ? { replyToExternalId } : {})
    });

    const agentPhone = input.agent_phone ?? conversation.channelPhoneNumber;
    const message = await this.messageIngest.ingestHumanMessage({
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      agentPhone,
      businessPhone: conversation.channelPhoneNumber,
      customerPhone: conversation.customer.phoneNumber,
      text: contentText,
      contentType: ContentType.TEMPLATE,
      externalId: wamid,
      replyToMessageId,
      quotedText,
      quotedSenderType,
      rawPayloadJson: {
        outbound: {
          template: {
            name: input.template_name,
            language,
            components: sendComponents,
            body_parameters: bodyParameters
          }
        }
      }
    });

    return message;
  }

  private async createWithRetry(
    graph: MetaGraphClient,
    wabaId: string,
    accessToken: string,
    definition: StandardTemplateDefinition
  ) {
    const payload = buildCreateTemplatePayload(definition);
    let lastError: unknown;
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      try {
        return await graph.createMessageTemplate(wabaId, accessToken, payload);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof MetaGraphApiError && error.isRetryable;
        if (!retryable || attempt === CREATE_ATTEMPTS) {
          throw error;
        }
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }

  private async syncFromMetaIfStale(tenantId: string, channel: ChannelWithToken) {
    const newest = await prisma.whatsappTemplate.findFirst({
      where: { tenantId },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true }
    });
    const syncedAt = newest?.lastSyncedAt?.getTime() ?? 0;
    if (Date.now() - syncedAt < SYNC_TTL_MS) {
      return;
    }

    try {
      const graph = graphClient();
      const remote = await graph.listMessageTemplates(
        channel.channel.wabaId!,
        channel.accessToken
      );
      for (const item of remote) {
        if (!item.name || !item.language) continue;
        await this.upsertFromMeta(tenantId, item, getStandardTemplate(item.name));
      }
    } catch (error) {
      logger.warn({ tenantId, err: error }, "Sync de plantillas Meta falló; se usa cache local");
    }
  }

  private async upsertFromMeta(
    tenantId: string,
    item: GraphMessageTemplate,
    definition?: StandardTemplateDefinition
  ) {
    const bodyPreview =
      extractBodyPreview(item.components) || definition?.bodyPreview || item.name || "";
    await this.upsertLocal(tenantId, {
      name: item.name ?? "",
      language: item.language ?? STANDARD_TEMPLATE_LANGUAGE,
      category: item.category ?? definition?.category ?? "UTILITY",
      status: mapMetaTemplateStatus(item.status),
      bodyPreview,
      variableCount:
        definition?.parameterFields.filter((field) => field.component === "body").length ??
        extractVariableCount(bodyPreview),
      quality: item.quality_score?.score ?? null,
      rejectionReason: item.rejected_reason ?? null,
      ...(item.id ? { metaTemplateId: item.id } : {}),
      ...(definition ? { packKey: STANDARD_TEMPLATE_PACK_KEY } : {}),
      lastError: null
    });
  }

  private async upsertLocal(
    tenantId: string,
    data: {
      name: string;
      language: string;
      category: string;
      status: WhatsappTemplate["status"];
      bodyPreview: string;
      variableCount: number;
      metaTemplateId?: string;
      packKey?: string;
      quality?: string | null;
      rejectionReason?: string | null;
      lastError?: string | null;
    }
  ) {
    const now = new Date();
    await prisma.whatsappTemplate.upsert({
      where: {
        tenantId_name_language: {
          tenantId,
          name: data.name,
          language: data.language
        }
      },
      create: {
        tenantId,
        name: data.name,
        language: data.language,
        category: data.category,
        status: data.status,
        bodyPreview: data.bodyPreview,
        variableCount: data.variableCount,
        componentsJson: [],
        lastSyncedAt: now,
        provisionedAt: now,
        ...(data.metaTemplateId ? { metaTemplateId: data.metaTemplateId } : {}),
        ...(data.packKey ? { packKey: data.packKey } : {}),
        ...(data.quality !== undefined ? { quality: data.quality } : {}),
        ...(data.rejectionReason !== undefined ? { rejectionReason: data.rejectionReason } : {}),
        ...(data.lastError !== undefined ? { lastError: data.lastError } : {})
      },
      update: {
        category: data.category,
        status: data.status,
        bodyPreview: data.bodyPreview,
        variableCount: data.variableCount,
        lastSyncedAt: now,
        ...(data.metaTemplateId ? { metaTemplateId: data.metaTemplateId } : {}),
        ...(data.packKey ? { packKey: data.packKey } : {}),
        ...(data.quality !== undefined ? { quality: data.quality } : {}),
        ...(data.rejectionReason !== undefined ? { rejectionReason: data.rejectionReason } : {}),
        ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
        ...(data.status === "PENDING" || data.status === "APPROVED"
          ? { provisionedAt: now }
          : {})
      }
    });
  }

  private serialize(
    definition: StandardTemplateDefinition | undefined,
    row: WhatsappTemplate | null
  ): PublicWhatsappTemplate {
    if (!definition && !row) {
      throw new Error("serialize requiere definition o row");
    }

    return {
      name: definition?.name ?? row!.name,
      language: definition?.language ?? row!.language,
      category: definition?.category ?? row!.category,
      status: row?.status ?? "NOT_CREATED",
      quality: row?.quality ?? null,
      rejection_reason: row?.rejectionReason ?? null,
      body_preview: row?.bodyPreview ?? definition?.bodyPreview ?? "",
      variable_count:
        definition?.parameterFields.filter((field) => field.component === "body").length ??
        row?.variableCount ??
        0,
      parameter_fields: definition?.parameterFields ?? [],
      in_pack: Boolean(definition),
      product_use: definition?.productUse ?? null,
      meta_template_id: row?.metaTemplateId ?? null,
      last_error: row?.lastError ?? null,
      updated_at: row?.updatedAt.toISOString() ?? null
    };
  }

  private async getChannel(tenantId: string): Promise<ChannelWithToken | null> {
    const channel = await prisma.tenantChannel.findUnique({
      where: {
        tenantId_channelType: {
          tenantId,
          channelType: "WHATSAPP_BUSINESS"
        }
      }
    });
    if (!channel || !channel.isActive || channel.status !== "ACTIVE") {
      return null;
    }
    return {
      channel,
      accessToken: this.tenantResolver.resolveAccessToken(channel.accessTokenEncrypted)
    };
  }

  private async requireChannelWithWaba(tenantId: string): Promise<ChannelWithToken> {
    const resolved = await this.getChannel(tenantId);
    if (!resolved) {
      throw templateError(
        "not_connected",
        "Este negocio aún no tiene un número de WhatsApp conectado.",
        409
      );
    }
    if (!resolved.channel.wabaId) {
      throw templateError(
        "missing_waba",
        "El canal no tiene WABA_ID. Vuelve a conectar WhatsApp.",
        409
      );
    }
    if (!resolved.accessToken) {
      throw templateError(
        "missing_channel_token",
        "El canal no tiene token. Vuelve a conectar WhatsApp.",
        409
      );
    }
    return resolved;
  }
}

export const whatsappTemplatesService = new WhatsappTemplatesService();
