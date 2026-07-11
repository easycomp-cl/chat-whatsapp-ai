import { ConversationMode } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import { usageEventsService, USAGE_EVENT_TYPES } from "../metrics/usage-events.service.js";
import { HANDOFF_REASON_LABELS, type HandoffReason } from "./prompts.js";

const DEFAULT_HANDOFF_MESSAGE = "Déjame revisarlo con un asesor y te respondemos en breve.";

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
      where: { tenantId: input.tenantId, isActive: true, notifyOnHandoff: true }
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

    const reasonLabel = HANDOFF_REASON_LABELS[input.handoffReason];
    const alertText = [
      "⚠️ Atención humana requerida",
      "",
      `Negocio: ${input.tenantName}`,
      `Cliente: ${input.customerName ?? "Sin nombre"}`,
      `Número: ${input.customerPhone}`,
      "",
      "Último mensaje:",
      `"${input.messageText}"`,
      "",
      "Motivo:",
      reasonLabel
    ].join("\n");

    for (const agent of agents) {
      try {
        await this.whatsAppClient.sendTextMessage({
          phoneNumberId: input.channelPhoneNumberId,
          accessToken: input.accessToken,
          to: agent.phoneNumber,
          text: alertText
        });
      } catch {
        // Notification failure should not block handoff
      }
    }

    await usageEventsService.track({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      eventType: USAGE_EVENT_TYPES.HUMAN_HANDOFF,
      metadata: { handoffReason: input.handoffReason, agentsNotified: agents.length }
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
