import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export const USAGE_EVENT_TYPES = {
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  AI_RESPONSE_SENT: "AI_RESPONSE_SENT",
  FAQ_RESPONSE_SENT: "FAQ_RESPONSE_SENT",
  RAG_RESPONSE_SENT: "RAG_RESPONSE_SENT",
  HUMAN_HANDOFF: "HUMAN_HANDOFF",
  BOT_DISABLED: "BOT_DISABLED",
  BOT_ENABLED: "BOT_ENABLED"
} as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[keyof typeof USAGE_EVENT_TYPES];

export class UsageEventsService {
  async track(input: {
    tenantId: string;
    conversationId?: string | null;
    eventType: UsageEventType | string;
    tokensInput?: number;
    tokensOutput?: number;
    estimatedCost?: number;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.usageEvent.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId ?? null,
        eventType: input.eventType,
        tokensInput: input.tokensInput ?? null,
        tokensOutput: input.tokensOutput ?? null,
        estimatedCost: input.estimatedCost ?? null,
        metadata: input.metadata ?? {}
      }
    });
  }
}

export const usageEventsService = new UsageEventsService();
