import { prisma } from "../../lib/prisma.js";
import { embeddingService } from "../ai/embedding.service.js";
import { env } from "../../config/env.js";
import { parseTenantKnowledgeConfig } from "../tenants/tenant-knowledge-config.js";
import { normalizeForMatch, scoreFaqDirectMatch } from "../../utils/direct-match.js";
import { buildFaqSearchText, faqMatchCandidates } from "./faq-search-text.js";

export type FaqMatch = {
  id: string;
  question: string;
  answer: string;
  score: number;
  matchType: "exact" | "direct" | "semantic";
};

export class FaqEngine {
  async findMatch(tenantId: string, userMessage: string): Promise<FaqMatch | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { config: true }
    });
    const knowledgeConfig = parseTenantKnowledgeConfig(tenant?.config?.configJson);
    const similarityThreshold =
      knowledgeConfig.faqSimilarityThreshold ?? env.FAQ_SIMILARITY_THRESHOLD;

    const faqs = await prisma.tenantFaq.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
    });

    if (!faqs.length) {
      return null;
    }

    const normalizedQuery = normalizeForMatch(userMessage);

    for (const faq of faqs) {
      const candidates = faqMatchCandidates(faq);
      for (const candidate of candidates) {
        if (normalizeForMatch(candidate) === normalizedQuery) {
          return {
            id: faq.id,
            question: faq.question,
            answer: faq.answer,
            score: 1,
            matchType: "exact"
          };
        }
      }
    }

    let bestDirect: FaqMatch | null = null;
    for (const faq of faqs) {
      const candidates = faqMatchCandidates(faq);
      const score = scoreFaqDirectMatch(userMessage, faq.question, candidates.slice(1));
      if (score >= 0.5 && (!bestDirect || score > bestDirect.score)) {
        bestDirect = {
          id: faq.id,
          question: faq.question,
          answer: faq.answer,
          score,
          matchType: "direct"
        };
      }
    }
    if (bestDirect) {
      return bestDirect;
    }

    const queryEmbedding = await embeddingService.embed(userMessage, tenantId);
    const vectorStr = embeddingService.toPgVector(queryEmbedding);

    const semanticMatches = await prisma.$queryRaw<
      Array<{ id: string; question: string; answer: string; score: number }>
    >`
      SELECT
        f.id,
        f.question,
        f.answer,
        1 - (f."questionEmbedding" <=> ${vectorStr}::vector) AS score
      FROM "TenantFaq" f
      WHERE f."tenantId" = ${tenantId}
        AND f."isActive" = true
        AND f."questionEmbedding" IS NOT NULL
      ORDER BY f."questionEmbedding" <=> ${vectorStr}::vector
      LIMIT 5
    `;

    const best = semanticMatches[0];
    if (best && best.score >= similarityThreshold) {
      return {
        id: best.id,
        question: best.question,
        answer: best.answer,
        score: best.score,
        matchType: "semantic"
      };
    }

    return null;
  }

  async indexFaqEmbedding(faqId: string): Promise<void> {
    const faq = await prisma.tenantFaq.findUnique({ where: { id: faqId } });
    if (!faq) {
      return;
    }

    const searchText = buildFaqSearchText(faq);
    await prisma.tenantFaq.update({
      where: { id: faqId },
      data: { searchText }
    });

    const embedding = await embeddingService.embed(searchText, faq.tenantId);
    const vectorStr = embeddingService.toPgVector(embedding);
    await prisma.$executeRaw`
      UPDATE "TenantFaq"
      SET "questionEmbedding" = ${vectorStr}::vector
      WHERE id = ${faqId}
    `;
  }

  async indexFaqEmbeddings(tenantId: string): Promise<void> {
    const faqs = await prisma.tenantFaq.findMany({
      where: { tenantId, isActive: true }
    });

    for (const faq of faqs) {
      await this.indexFaqEmbedding(faq.id);
    }
  }
}

export const faqEngine = new FaqEngine();
