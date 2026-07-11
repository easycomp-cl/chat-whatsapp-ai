import { KnowledgeDocumentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { embeddingService } from "../ai/embedding.service.js";
import { storageService } from "../storage/storage.service.js";
import { parseTenantKnowledgeConfig } from "../tenants/tenant-knowledge-config.js";
import { chunkText } from "../../utils/chunk-text.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function extractTextFromBuffer(buffer: Buffer, sourceType: string): Promise<string> {
  if (sourceType === "PDF") {
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (sourceType === "DOCX") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString("utf8");
}

function mimeToSourceType(mimeType?: string | null): string {
  if (!mimeType) return "TXT";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word") || mimeType.includes("docx")) return "DOCX";
  return "TXT";
}

export class KnowledgeIndexerService {
  async resolveDocumentText(document: {
    rawText: string | null;
    storagePath: string | null;
    mimeType: string | null;
    sourceType: string;
  }): Promise<string> {
    if (document.rawText?.trim()) {
      return document.rawText.trim();
    }
    if (document.storagePath) {
      const buffer = await storageService.readByStoragePath(document.storagePath);
      const sourceType = document.sourceType !== "MANUAL" ? document.sourceType : mimeToSourceType(document.mimeType);
      return (await extractTextFromBuffer(buffer, sourceType)).trim();
    }
    return "";
  }

  async indexDocument(documentId: string): Promise<{ chunksIndexed: number }> {
    const document = await prisma.tenantDocument.findUnique({
      where: { id: documentId },
      include: { tenant: { include: { config: true } } }
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const knowledgeConfig = parseTenantKnowledgeConfig(document.tenant.config?.configJson);

    await prisma.tenantDocument.update({
      where: { id: documentId },
      data: { status: KnowledgeDocumentStatus.INDEXING, indexError: null }
    });

    try {
      const rawText = (await this.resolveDocumentText(document)).trim();
      if (!rawText) {
        throw new Error("Document has no text to index");
      }

      if (!document.rawText) {
        await prisma.tenantDocument.update({
          where: { id: documentId },
          data: { rawText }
        });
      }

      await prisma.knowledgeChunk.deleteMany({ where: { documentId } });

      const chunks = chunkText(rawText, {
        chunkSize: knowledgeConfig.chunkSize,
        chunkOverlap: knowledgeConfig.chunkOverlap
      });
      const embeddings = await embeddingService.embedBatch(chunks, document.tenantId);

      const chunkRecords = chunks.map((chunk, i) => ({
        id: `${documentId}-chunk-${i}`,
        tenantId: document.tenantId,
        documentId,
        chunkText: chunk,
        metadata: { index: i, title: document.title },
        embedding: embeddings[i]
      }));

      await prisma.$transaction(async (tx) => {
        for (const record of chunkRecords) {
          await tx.knowledgeChunk.create({
            data: {
              id: record.id,
              tenantId: record.tenantId,
              documentId: record.documentId,
              chunkText: record.chunkText,
              metadata: record.metadata
            }
          });
        }
      });

      for (const record of chunkRecords) {
        if (!record.embedding) continue;
        const vectorStr = embeddingService.toPgVector(record.embedding);
        await prisma.$executeRaw`
          UPDATE "KnowledgeChunk"
          SET embedding = ${vectorStr}::vector
          WHERE id = ${record.id}
        `;
      }

      await prisma.tenantDocument.update({
        where: { id: documentId },
        data: {
          status: KnowledgeDocumentStatus.INDEXED,
          indexedAt: new Date(),
          indexError: null
        }
      });

      return { chunksIndexed: chunkRecords.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Index failed";
      await prisma.tenantDocument.update({
        where: { id: documentId },
        data: {
          status: KnowledgeDocumentStatus.ERROR,
          indexError: message
        }
      });
      throw error;
    }
  }

  async indexFromBuffer(input: {
    tenantId: string;
    title: string;
    sourceType: string;
    buffer: Buffer;
    fileUrl?: string;
    storagePath?: string;
    mimeType?: string;
    fileSize?: number;
  }): Promise<{ documentId: string; chunksIndexed: number }> {
    const rawText = await extractTextFromBuffer(input.buffer, input.sourceType);
    const document = await prisma.tenantDocument.create({
      data: {
        tenantId: input.tenantId,
        title: input.title,
        sourceType: input.sourceType as "PDF" | "DOCX" | "TXT" | "MANUAL" | "URL",
        fileUrl: input.fileUrl ?? null,
        storagePath: input.storagePath ?? null,
        mimeType: input.mimeType ?? null,
        fileSize: input.fileSize ?? input.buffer.length,
        rawText,
        status: KnowledgeDocumentStatus.PENDING
      }
    });

    const result = await this.indexDocument(document.id);
    return { documentId: document.id, chunksIndexed: result.chunksIndexed };
  }
}

export const knowledgeIndexerService = new KnowledgeIndexerService();
