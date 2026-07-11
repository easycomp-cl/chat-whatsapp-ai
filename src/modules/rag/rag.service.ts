import { prisma } from "../../lib/prisma.js";
import { embeddingService } from "../ai/embedding.service.js";
import { parseTenantKnowledgeConfig } from "../tenants/tenant-knowledge-config.js";
import { scoreChunkForQuery } from "../../utils/direct-match.js";

export type RagChunkHit = {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkText: string;
  score: number;
};

export class RagService {
  async retrieve(tenantId: string, query: string, limit?: number): Promise<RagChunkHit[]> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { config: true }
    });
    const knowledgeConfig = parseTenantKnowledgeConfig(tenant?.config?.configJson);
    if (!knowledgeConfig.enabled) {
      return [];
    }

    const topK = limit ?? knowledgeConfig.topK;
    const queryEmbedding = await embeddingService.embed(query, tenantId);
    const vectorStr = embeddingService.toPgVector(queryEmbedding);

    const hits = await prisma.$queryRaw<
      Array<{
        id: string;
        documentId: string;
        documentTitle: string;
        chunkText: string;
        score: number;
      }>
    >`
      SELECT
        kc.id,
        kc."documentId",
        td.title AS "documentTitle",
        kc."chunkText",
        1 - (kc.embedding <=> ${vectorStr}::vector) AS score
      FROM "KnowledgeChunk" kc
      JOIN "TenantDocument" td ON td.id = kc."documentId"
      WHERE kc."tenantId" = ${tenantId}
        AND kc.embedding IS NOT NULL
        AND td.status = 'INDEXED'
      ORDER BY kc.embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `;

    return hits
      .map((hit) => ({
        id: hit.id,
        documentId: hit.documentId,
        documentTitle: hit.documentTitle,
        chunkText: hit.chunkText,
        score: scoreChunkForQuery(query, hit.chunkText, hit.score)
      }))
      .sort((a, b) => b.score - a.score);
  }

  getBestScore(hits: RagChunkHit[]): number {
    return hits.length ? Math.max(...hits.map((h) => h.score)) : 0;
  }

  formatContext(hits: RagChunkHit[]): string {
    return hits
      .map((hit, index) => `[${index + 1}] ${hit.documentTitle}\n${hit.chunkText}`)
      .join("\n\n");
  }
}

export const ragService = new RagService();
