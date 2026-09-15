import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { USAGE_EVENT_TYPES } from "./usage-events.service.js";

type SummaryRow = {
  messages_received: number;
  ai_responses: number;
  faq_responses: number;
  rag_responses: number;
  human_handoffs: number;
  estimated_ai_cost: number;
};

type QuestionRow = {
  question: string;
  count: number;
};

export class MetricsService {
  async getSummary(tenantId: string, from?: Date, to?: Date) {
    const row = await this.fetchSummaryRow(tenantId, from, to);
    const estimatedHoursSaved = (row.ai_responses * 1.5) / 60;

    return {
      total_messages_received: row.messages_received,
      total_ai_responses: row.ai_responses,
      total_faq_responses: row.faq_responses,
      total_rag_responses: row.rag_responses,
      total_human_handoffs: row.human_handoffs,
      estimated_ai_cost: row.estimated_ai_cost,
      estimated_hours_saved: estimatedHoursSaved
    };
  }

  async getTopQuestions(tenantId: string, limit = 10, from?: Date, to?: Date) {
    const rows = await prisma.$queryRaw<QuestionRow[]>`
      SELECT lower(trim("contentText")) AS question, COUNT(*)::int AS count
      FROM "Message"
      WHERE "tenantId" = ${tenantId}
        AND direction = 'INBOUND'::"MessageDirection"
        AND "senderType" = 'CUSTOMER'::"SenderType"
        AND trim("contentText") <> ''
        AND (${from ?? null}::timestamptz IS NULL OR "createdAt" >= ${from ?? null})
        AND (${to ?? null}::timestamptz IS NULL OR "createdAt" <= ${to ?? null})
      GROUP BY 1
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({ question: row.question, count: row.count }));
  }

  async getUsage(tenantId: string, from?: Date, to?: Date) {
    return prisma.usageEvent.findMany({
      where: { tenantId, ...this.dateFilter(from, to) },
      select: {
        id: true,
        tenantId: true,
        conversationId: true,
        eventType: true,
        tokensInput: true,
        tokensOutput: true,
        estimatedCost: true,
        metadata: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getDashboard(tenantId: string, from?: Date, to?: Date, questionsLimit = 10) {
    const [summaryRow, topQuestions, usage] = await Promise.all([
      this.fetchSummaryRow(tenantId, from, to),
      this.getTopQuestions(tenantId, questionsLimit, from, to),
      this.getUsage(tenantId, from, to)
    ]);

    const estimatedHoursSaved = (summaryRow.ai_responses * 1.5) / 60;

    return {
      summary: {
        total_messages_received: summaryRow.messages_received,
        total_ai_responses: summaryRow.ai_responses,
        total_faq_responses: summaryRow.faq_responses,
        total_rag_responses: summaryRow.rag_responses,
        total_human_handoffs: summaryRow.human_handoffs,
        estimated_ai_cost: summaryRow.estimated_ai_cost,
        estimated_hours_saved: estimatedHoursSaved
      },
      top_questions: topQuestions,
      usage
    };
  }

  private async fetchSummaryRow(tenantId: string, from?: Date, to?: Date): Promise<SummaryRow> {
    const rows = await prisma.$queryRaw<SummaryRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE "eventType" = ${USAGE_EVENT_TYPES.MESSAGE_RECEIVED})::int AS messages_received,
        COUNT(*) FILTER (WHERE "eventType" = ${USAGE_EVENT_TYPES.AI_RESPONSE_SENT})::int AS ai_responses,
        COUNT(*) FILTER (WHERE "eventType" = ${USAGE_EVENT_TYPES.FAQ_RESPONSE_SENT})::int AS faq_responses,
        COUNT(*) FILTER (WHERE "eventType" = ${USAGE_EVENT_TYPES.RAG_RESPONSE_SENT})::int AS rag_responses,
        COUNT(*) FILTER (WHERE "eventType" = ${USAGE_EVENT_TYPES.HUMAN_HANDOFF})::int AS human_handoffs,
        COALESCE(SUM("estimatedCost") FILTER (WHERE "eventType" = ${USAGE_EVENT_TYPES.AI_RESPONSE_SENT}), 0)::float AS estimated_ai_cost
      FROM "UsageEvent"
      WHERE "tenantId" = ${tenantId}
        AND (${from ?? null}::timestamptz IS NULL OR "createdAt" >= ${from ?? null})
        AND (${to ?? null}::timestamptz IS NULL OR "createdAt" <= ${to ?? null})
    `;

    return (
      rows[0] ?? {
        messages_received: 0,
        ai_responses: 0,
        faq_responses: 0,
        rag_responses: 0,
        human_handoffs: 0,
        estimated_ai_cost: 0
      }
    );
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
