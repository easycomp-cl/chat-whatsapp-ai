import { prisma } from "../../../lib/prisma.js";
import { faqEngine } from "../../faq/faq.engine.js";
import { buildFaqSearchText } from "../../faq/faq-search-text.js";
import { normalizeForMatch } from "../../../utils/direct-match.js";
import type { FaqDetectionAiResult } from "../types/detected-faq.type.js";

export class FaqDetectionService {
  async saveFromAi(input: {
    tenantId: string;
    importJobId: string;
    result: FaqDetectionAiResult;
  }) {
    const items = input.result.detected_faqs ?? [];
    if (!items.length) {
      return [];
    }

    return prisma.$transaction(
      items.map((faq) =>
        prisma.detectedFaqSuggestion.create({
          data: {
            tenantId: input.tenantId,
            importJobId: input.importJobId,
            question: faq.question,
            normalizedQuestion: faq.normalized_question,
            suggestedAnswer: faq.suggested_answer,
            category: faq.category || null,
            evidenceCount: faq.evidence_count,
            confidence: faq.confidence
          }
        })
      )
    );
  }

  async listByImportJob(tenantId: string, importJobId: string) {
    return prisma.detectedFaqSuggestion.findMany({
      where: { tenantId, importJobId },
      orderBy: [{ evidenceCount: "desc" }, { confidence: "desc" }]
    });
  }

  async listPendingByTenant(tenantId: string) {
    return prisma.detectedFaqSuggestion.findMany({
      where: { tenantId, status: "PENDING_REVIEW" },
      orderBy: [{ evidenceCount: "desc" }, { confidence: "desc" }],
      include: {
        importJob: { select: { id: true, originalFilename: true, completedAt: true } }
      }
    });
  }

  async updateSuggestion(
    tenantId: string,
    suggestionId: string,
    data: { question?: string; suggested_answer?: string; category?: string }
  ) {
    const existing = await prisma.detectedFaqSuggestion.findFirst({
      where: { id: suggestionId, tenantId }
    });
    if (!existing) {
      return null;
    }

    return prisma.detectedFaqSuggestion.update({
      where: { id: suggestionId },
      data: {
        ...(data.question !== undefined && { question: data.question }),
        ...(data.suggested_answer !== undefined && { suggestedAnswer: data.suggested_answer }),
        ...(data.category !== undefined && { category: data.category }),
        status: "EDITED"
      }
    });
  }

  async reject(tenantId: string, suggestionId: string, reviewedBy?: string) {
    const existing = await prisma.detectedFaqSuggestion.findFirst({
      where: { id: suggestionId, tenantId }
    });
    if (!existing) {
      return null;
    }

    return prisma.detectedFaqSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: "REJECTED",
        reviewedBy: reviewedBy ?? null,
        reviewedAt: new Date()
      }
    });
  }

  async approve(input: {
    tenantId: string;
    suggestionId: string;
    finalQuestion?: string;
    finalAnswer?: string;
    reviewedBy?: string;
  }) {
    const suggestion = await prisma.detectedFaqSuggestion.findFirst({
      where: { id: input.suggestionId, tenantId: input.tenantId }
    });
    if (!suggestion) {
      return null;
    }

    const question = (input.finalQuestion ?? suggestion.question).trim();
    const answer = (input.finalAnswer ?? suggestion.suggestedAnswer ?? "").trim();
    if (!question || !answer) {
      throw new Error("question and answer are required");
    }

    const normalized = normalizeForMatch(question);
    const duplicates = await prisma.tenantFaq.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      select: { id: true, question: true }
    });
    const isDuplicate = duplicates.some((f) => normalizeForMatch(f.question) === normalized);
    if (isDuplicate) {
      throw new Error("A FAQ with the same question already exists");
    }

    const searchText = buildFaqSearchText({ question });

    const [updated, faq] = await prisma.$transaction([
      prisma.detectedFaqSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: "APPROVED",
          question,
          suggestedAnswer: answer,
          reviewedBy: input.reviewedBy ?? null,
          reviewedAt: new Date()
        }
      }),
      prisma.tenantFaq.create({
        data: {
          tenantId: input.tenantId,
          question,
          answer,
          category: suggestion.category,
          searchText
        }
      })
    ]);

    await faqEngine.indexFaqEmbedding(faq.id);
    return updated;
  }
}

export const faqDetectionService = new FaqDetectionService();
