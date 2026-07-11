import type { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { enqueueKnowledgeIndex } from "../queue/knowledge-index.queue.js";
import { storageService } from "../storage/storage.service.js";
import { paramId } from "../../utils/params.js";
import { requireTenantDocument, requireTenantExists } from "../../utils/tenant-resource.js";
import { knowledgeIndexerService } from "../knowledge/knowledge-indexer.service.js";
import { parseTenantKnowledgeConfig } from "../tenants/tenant-knowledge-config.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const createDocSchema = z
  .object({
    title: z.string().min(1),
    source_type: z.enum(["PDF", "DOCX", "TXT", "MANUAL", "URL"]).default("MANUAL"),
    raw_text: z.string().optional(),
    file_url: z.string().url().optional(),
    auto_index: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    const text = data.raw_text?.trim() ?? "";
    if (text.length > 0) {
      return;
    }
    if (data.file_url) {
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "raw_text must not be empty (or provide a file_url)",
      path: ["raw_text"]
    });
  });

function textByteSize(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function mapKnowledgeDocumentListItem(doc: {
  id: string;
  tenantId: string;
  title: string;
  sourceType: string;
  fileUrl: string | null;
  storagePath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  rawText: string | null;
  status: string;
  indexError: string | null;
  indexedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const contentLength = doc.rawText
    ? textByteSize(doc.rawText)
    : (doc.fileSize ?? 0);
  const preview = doc.rawText?.trim().slice(0, 240) ?? null;

  return {
    ...doc,
    content_length: contentLength,
    content_preview: preview,
    has_content: contentLength > 0
  };
}

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes("pdf")) return ".pdf";
  if (mimeType.includes("word") || mimeType.includes("docx")) return ".docx";
  if (mimeType.includes("text")) return ".txt";
  return ".bin";
}

function sourceTypeFromMime(mimeType: string): "PDF" | "DOCX" | "TXT" {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word") || mimeType.includes("docx")) return "DOCX";
  return "TXT";
}

export const knowledgeUploadMiddleware = upload.single("file");

export async function listKnowledgeDocuments(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const docs = await prisma.tenantDocument.findMany({
    where: { tenantId: businessId },
    orderBy: { createdAt: "desc" }
  });
  res.json(docs.map(mapKnowledgeDocumentListItem));
}

export async function getKnowledgeDocument(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const id = paramId(req, "id");
  const access = await requireTenantDocument(req, res, id, businessId);
  if (!access) {
    return;
  }

  const doc = await prisma.tenantDocument.findUnique({ where: { id } });
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const chunkCount = await prisma.knowledgeChunk.count({ where: { documentId: id } });
  let content = doc.rawText?.trim() ?? "";
  if (!content) {
    try {
      content = await knowledgeIndexerService.resolveDocumentText(doc);
    } catch {
      content = "";
    }
  }

  res.json({
    ...mapKnowledgeDocumentListItem(doc),
    content: content || null,
    chunkCount
  });
}

export async function createKnowledgeDocument(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const body = createDocSchema.parse(req.body);
  const rawText = body.raw_text?.trim() ?? null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: businessId },
    include: { config: true }
  });
  const knowledgeConfig = parseTenantKnowledgeConfig(tenant?.config?.configJson);
  const autoIndex = body.auto_index ?? knowledgeConfig.autoIndexOnCreate;

  const doc = await prisma.tenantDocument.create({
    data: {
      tenantId: businessId,
      title: body.title,
      sourceType: body.source_type,
      rawText,
      fileUrl: body.file_url ?? null,
      fileSize: rawText ? textByteSize(rawText) : null,
      status: "PENDING"
    }
  });

  if (autoIndex && (rawText || body.file_url)) {
    await enqueueKnowledgeIndex(doc.id, businessId);
  }

  res.status(201).json(doc);
}

export async function uploadKnowledgeDocument(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "file is required" });
    return;
  }
  if (!file.buffer.length || file.size <= 0) {
    res.status(400).json({ error: "file must not be empty" });
    return;
  }

  const sourceType = sourceTypeFromMime(file.mimetype);
  if (sourceType === "TXT" && !file.buffer.toString("utf8").trim()) {
    res.status(400).json({ error: "file must contain text content" });
    return;
  }

  const title = typeof req.body.title === "string" && req.body.title.trim()
    ? req.body.title.trim()
    : file.originalname;

  const doc = await prisma.tenantDocument.create({
    data: {
      tenantId: businessId,
      title,
      sourceType,
      mimeType: file.mimetype,
      fileSize: file.size,
      status: "PENDING"
    }
  });

  const { storagePath, fileSize } = await storageService.saveDocument({
    tenantId: businessId,
    documentId: doc.id,
    buffer: file.buffer,
    extension: extensionFromMime(file.mimetype)
  });

  const updated = await prisma.tenantDocument.update({
    where: { id: doc.id },
    data: { storagePath, fileSize }
  });

  await enqueueKnowledgeIndex(doc.id, businessId);
  res.status(201).json(updated);
}

export async function indexKnowledgeDocument(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const id = paramId(req, "id");
  const doc = await requireTenantDocument(req, res, id, businessId);
  if (!doc) {
    return;
  }

  await enqueueKnowledgeIndex(id, doc.tenantId);
  const refreshed = await prisma.tenantDocument.findUnique({ where: { id } });
  res.json({ ...refreshed, queued: true });
}

export async function deleteKnowledgeDocument(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const id = paramId(req, "id");
  const doc = await requireTenantDocument(req, res, id, businessId);
  if (!doc) {
    return;
  }

  if (doc.storagePath) {
    await storageService.deleteByStoragePath(doc.storagePath);
  }

  await prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });
  await prisma.tenantDocument.delete({ where: { id } });
  res.status(204).send();
}
