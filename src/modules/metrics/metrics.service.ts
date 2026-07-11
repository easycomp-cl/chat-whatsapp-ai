import { MessageDirection, SenderType, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { USAGE_EVENT_TYPES } from "./usage-events.service.js";

export class MetricsService {
  async getSummary(tenantId: string, from?: Date, to?: Date) {
    const dateFilter = this.dateFilter(from, to);

    const [messagesReceived, aiResponses, faqResponses, ragResponses, humanHandoffs, costAgg] =
      await Promise.all([
        prisma.usageEvent.count({
          where: { tenantId, eventType: USAGE_EVENT_TYPES.MESSAGE_RECEIVED, ...dateFilter }
        }),
        prisma.usageEvent.count({
          where: { tenantId, eventType: USAGE_EVENT_TYPES.AI_RESPONSE_SENT, ...dateFilter }
        }),
        prisma.usageEvent.count({
          where: { tenantId, eventType: USAGE_EVENT_TYPES.FAQ_RESPONSE_SENT, ...dateFilter }
        }),
        prisma.usageEvent.count({
          where: { tenantId, eventType: USAGE_EVENT_TYPES.RAG_RESPONSE_SENT, ...dateFilter }
        }),
        prisma.usageEvent.count({
          where: { tenantId, eventType: USAGE_EVENT_TYPES.HUMAN_HANDOFF, ...dateFilter }
        }),
        prisma.usageEvent.aggregate({
          where: { tenantId, eventType: USAGE_EVENT_TYPES.AI_RESPONSE_SENT, ...dateFilter },
          _sum: { estimatedCost: true }
        })
      ]);

    const estimatedAiCost = costAgg._sum.estimatedCost ?? 0;
    const estimatedHoursSaved = (aiResponses * 1.5) / 60;

    return {
      total_messages_received: messagesReceived,
      total_ai_responses: aiResponses,
      total_faq_responses: faqResponses,
      total_rag_responses: ragResponses,
      total_human_handoffs: humanHandoffs,
      estimated_ai_cost: estimatedAiCost,
      estimated_hours_saved: estimatedHoursSaved
    };
  }

  async getTopQuestions(tenantId: string, limit = 10, from?: Date, to?: Date) {
    const dateRange = this.dateRange(from, to);
    const where: Prisma.MessageWhereInput = {
      tenantId,
      direction: MessageDirection.INBOUND,
      senderType: SenderType.CUSTOMER
    };
    if (dateRange) {
      where.createdAt = dateRange;
    }

    const messages = await prisma.message.findMany({
      where,
      select: { contentText: true },
      take: 500,
      orderBy: { createdAt: "desc" }
    });

    const counts = new Map<string, number>();
    for (const msg of messages) {
      const key = msg.contentText.trim().toLowerCase();
      if (key) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([question, count]) => ({ question, count }));
  }

  async getUsage(tenantId: string, from?: Date, to?: Date) {
    return prisma.usageEvent.findMany({
      where: { tenantId, ...this.dateFilter(from, to) },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  private dateFilter(from?: Date, to?: Date): { createdAt?: Prisma.DateTimeFilter } {
    const range = this.dateRange(from, to);
    return range ? { createdAt: range } : {};
  }

  private dateRange(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    if (from) filter.gte = from;
    if (to) filter.lte = to;
    return filter;
  }
}

export const metricsService = new MetricsService();
