import { prisma } from "../../lib/prisma.js";
import type { IncomingMediaAttachment } from "../../types/whatsapp.js";
import { flowEngineService } from "./flow-engine.service.js";

export interface FlowOrchestratorInboundInput {
  tenantId: string;
  tenantName: string;
  conversationId: string;
  customerId: string;
  customerPhone: string;
  customerName?: string | null;
  messageText: string;
  messageExternalId: string;
  media?: IncomingMediaAttachment;
  channelPhoneNumber: string;
  channelPhoneNumberId: string;
  accessToken: string;
  handoffMessage?: string;
}

export interface FlowOrchestratorReply {
  text: string;
  aiGenerated?: boolean;
}

export interface FlowOrchestratorResult {
  handled: boolean;
  replies: FlowOrchestratorReply[];
}

const INTENT_KEYWORDS: Record<string, string[]> = {
  request_custom_quote: [
    "cotizar",
    "cotización",
    "cotizacion",
    "presupuesto",
    "tabla",
    "tablas",
    "quote"
  ]
};

export class FlowOrchestratorService {
  async handleInbound(input: FlowOrchestratorInboundInput): Promise<FlowOrchestratorResult> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId },
      select: { id: true, activeFlowRunId: true, mode: true }
    });

    if (!conversation) {
      return { handled: false, replies: [] };
    }

    const handoffContext = {
      tenantName: input.tenantName,
      customerPhone: input.customerPhone,
      customerName: input.customerName ?? null,
      channelPhoneNumberId: input.channelPhoneNumberId,
      accessToken: input.accessToken,
      ...(input.handoffMessage ? { handoffMessage: input.handoffMessage } : {})
    };

    if (conversation.activeFlowRunId) {
      const result = await flowEngineService.processEvent({
        runId: conversation.activeFlowRunId,
        tenantId: input.tenantId,
        incomingText: input.messageText,
        sourceMessageId: input.messageExternalId,
        ...(input.media ? { incomingMedia: input.media } : {}),
        accessToken: input.accessToken,
        idempotencyKey: `${input.tenantId}:whatsapp:${input.messageExternalId}`,
        handoffContext
      });

      return {
        handled: true,
        replies: result.replies
      };
    }

    const triggerMatch = await this.matchInboundTrigger(input.tenantId, input.messageText);
    if (!triggerMatch) {
      return { handled: false, replies: [] };
    }

    const started = await flowEngineService.start({
      tenantId: input.tenantId,
      flowDefinitionId: triggerMatch.flowDefinitionId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      startedBy: triggerMatch.startedBy,
      versionId: triggerMatch.versionId
    });

    const continued = await flowEngineService.processEvent({
      runId: started.runId,
      tenantId: input.tenantId,
      incomingText: input.messageText,
      sourceMessageId: input.messageExternalId,
      ...(input.media ? { incomingMedia: input.media } : {}),
      accessToken: input.accessToken,
      idempotencyKey: `${input.tenantId}:whatsapp:${input.messageExternalId}:start`,
      handoffContext
    });

    return {
      handled: true,
      replies: [...started.replies, ...continued.replies]
    };
  }

  private async matchInboundTrigger(tenantId: string, messageText: string) {
    const normalized = messageText.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const flows = await prisma.flowDefinition.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        currentVersionId: { not: null }
      },
      include: {
        currentVersion: {
          include: {
            triggers: {
              where: {
                isEnabled: true,
                triggerType: { in: ["KEYWORD", "AI_INTENT"] }
              }
            }
          }
        }
      }
    });

    const matches: Array<{
      flowDefinitionId: string;
      versionId: string;
      startedBy: "TRIGGER_KEYWORD" | "TRIGGER_INTENT";
      priority: number;
    }> = [];

    for (const flow of flows) {
      const version = flow.currentVersion;
      if (!version) {
        continue;
      }

      for (const trigger of version.triggers) {
        if (trigger.triggerType === "KEYWORD") {
          const config = trigger.configurationJson as { keywords?: string[] };
          const keywords = config.keywords ?? [];
          if (keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
            matches.push({
              flowDefinitionId: flow.id,
              versionId: version.id,
              startedBy: "TRIGGER_KEYWORD",
              priority: trigger.priority
            });
          }
        }

        if (trigger.triggerType === "AI_INTENT") {
          const config = trigger.configurationJson as { intent?: string };
          const intent = config.intent ?? "";
          const keywords = INTENT_KEYWORDS[intent] ?? [];
          if (keywords.some((kw) => normalized.includes(kw))) {
            matches.push({
              flowDefinitionId: flow.id,
              versionId: version.id,
              startedBy: "TRIGGER_INTENT",
              priority: trigger.priority
            });
          }
        }
      }
    }

    matches.sort((a, b) => a.priority - b.priority);
    return matches[0] ?? null;
  }
}

export const flowOrchestratorService = new FlowOrchestratorService();
