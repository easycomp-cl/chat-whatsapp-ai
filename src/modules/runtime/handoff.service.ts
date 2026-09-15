import { ConversationMode } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import { usageEventsService, USAGE_EVENT_TYPES } from "../metrics/usage-events.service.js";
import {
  STANDARD_TEMPLATE_LANGUAGE,
  buildSendTemplateComponents,
  getStandardTemplate
} from "../whatsapp-templates/standard-template-pack.js";
import { HANDOFF_REASON_LABELS, type HandoffReason } from "./prompts.js";

const DEFAULT_HANDOFF_MESSAGE = "Déjame revisarlo con un asesor y te respondemos en breve.";
const HANDOFF_TEMPLATE_NAME = "aviso_handoff_es";

export class HandoffService {
  constructor(private readonly whatsAppClient = new WhatsAppClient()) {}

  async execute(input: {
    tenantId: string;
    tenantName: string;
    conversationId: string;
    customerPhone: string;
    customerName?: string | null;
    messageText: string;
    handoffReason: HandoffReason;
    handoffMessage?: string;
    channelPhoneNumberId: string;
    accessToken: string;
  }): Promise<{ reply: string }> {
    const agents = await prisma.tenantAdmin.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        notifyOnHandoff: true,
        phoneVerifiedAt: { not: null }
      }
    });

    const primaryAgent = agents.find((a) => a.isPrimary) ?? agents[0];

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        mode: ConversationMode.HUMAN,
        assignedAdminId: primaryAgent?.id ?? null,
        handoffReason: input.handoffReason
      }
    });

    const reply = input.handoffMessage ?? DEFAULT_HANDOFF_MESSAGE;
    const template = await prisma.whatsappTemplate.findUnique({
      where: {
        tenantId_name_language: {
          tenantId: input.tenantId,
          name: HANDOFF_TEMPLATE_NAME,
          language: STANDARD_TEMPLATE_LANGUAGE
        }
      }
    });

    let agentsNotified = 0;
    if (!template || template.status !== "APPROVED") {
      logger.warn(
        { tenantId: input.tenantId, conversationId: input.conversationId, status: template?.status },
        "Handoff: no se envía aviso al admin porque aviso_handoff_es no está APPROVED"
      );
    } else {
      const definition = getStandardTemplate(HANDOFF_TEMPLATE_NAME);
      const customerLabel = input.customerName?.trim() || input.customerPhone;
      for (const agent of agents) {
        const bodyParameters = [agent.name, input.tenantName, customerLabel];
        try {
          await this.whatsAppClient.sendTemplateMessage({
            phoneNumberId: input.channelPhoneNumberId,
            accessToken: input.accessToken,
            to: agent.phoneNumber,
            templateName: HANDOFF_TEMPLATE_NAME,
            languageCode: STANDARD_TEMPLATE_LANGUAGE,
            components: buildSendTemplateComponents({
              ...(definition ? { definition } : {}),
              bodyParameters
            })
          });
          agentsNotified += 1;
        } catch (error) {
          logger.warn(
            { err: error, tenantId: input.tenantId, adminId: agent.id },
            "Handoff: falló el envío de aviso_handoff_es"
          );
        }
      }
    }

    await usageEventsService.track({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      eventType: USAGE_EVENT_TYPES.HUMAN_HANDOFF,
      metadata: {
        handoffReason: input.handoffReason,
        agentsNotified,
        reasonLabel: HANDOFF_REASON_LABELS[input.handoffReason]
      }
    });

    return { reply };
  }

  async enableBotMode(conversationId: string, botResumeAt?: Date | null) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        mode: ConversationMode.BOT,
        handoffReason: null,
        botResumeAt: botResumeAt ?? null,
        assignedAdminId: null
      }
    });
  }
}

export const handoffService = new HandoffService();
