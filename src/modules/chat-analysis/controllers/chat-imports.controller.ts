import type { Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../../../lib/prisma.js";
import { paramId } from "../../../utils/params.js";
import { decodeUploadedFilename } from "../../../utils/decode-filename.js";
import { requireTenantExists } from "../../../utils/tenant-resource.js";
import { enqueueChatImportAnalysis } from "../../queue/chat-import-analysis.queue.js";
import { storageService } from "../../storage/storage.service.js";
import { chatImportService } from "../services/chat-import.service.js";
import { faqDetectionService } from "../services/faq-detection.service.js";
import { toneAnalysisService } from "../services/tone-analysis.service.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".txt" || ext === ".zip") {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos .txt o .zip"));
    }
  }
});

export const chatImportUploadMiddleware = upload.single("file");

function progressFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { progress_percent: null as number | null, progress_step: null as string | null };
  }
  const record = metadata as Record<string, unknown>;
  return {
    progress_percent:
      typeof record.progress_percent === "number" ? record.progress_percent : null,
    progress_step: typeof record.progress_step === "string" ? record.progress_step : null
  };
}

function mapJob(job: {
  id: string;
  status: string;
  totalMessages: number;
  customerMessagesCount: number;
  businessMessagesCount: number;
  detectedFaqCount: number;
  detectedToneSummary: string | null;
  errorMessage: string | null;
  originalFilename: string;
  businessSenderName: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  metadata?: unknown;
}) {
  const progress = progressFromMetadata(job.metadata);
  const status = job.status.toLowerCase();
  const fallbackPercent =
    status === "pending" ? 5 : status === "processing" ? 15 : status === "completed" ? 100 : 0;

  return {
    id: job.id,
    status,
    total_messages: job.totalMessages,
    customer_messages_count: job.customerMessagesCount,
    business_messages_count: job.businessMessagesCount,
    detected_faq_count: job.detectedFaqCount,
    detected_tone_summary: job.detectedToneSummary,
    error_message: job.errorMessage,
    original_filename: decodeUploadedFilename(job.originalFilename),
    business_sender_name: job.businessSenderName,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    progress_percent: progress.progress_percent ?? fallbackPercent,
    progress_step: progress.progress_step
  };
}

export async function uploadChatImport(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const file = req.file;
  if (!file || !file.buffer.length) {
    res.status(400).json({ error: "file is required and must not be empty" });
    return;
  }

  const businessSenderName =
    typeof req.body.business_sender_name === "string" && req.body.business_sender_name.trim()
      ? decodeUploadedFilename(req.body.business_sender_name.trim())
      : null;

  try {
    await chatImportService.enforceMaxJobs(businessId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Límite de importaciones alcanzado";
    res.status(400).json({ error: message });
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase() || ".txt";
  const originalFilename = decodeUploadedFilename(file.originalname);
  const job = await prisma.chatImportJob.create({
    data: {
      tenantId: businessId,
      originalFilename,
      fileUrl: "",
      businessSenderName,
      status: "PENDING"
    }
  });

  const { storagePath } = await storageService.saveChatImport({
    tenantId: businessId,
    importJobId: job.id,
    buffer: file.buffer,
    extension: ext
  });

  const fileUrl = storageService.publicUrl(storagePath);
  const updated = await prisma.chatImportJob.update({
    where: { id: job.id },
    data: { storagePath, fileUrl }
  });

  await enqueueChatImportAnalysis(job.id, businessId);

  res.status(201).json({
    import_job_id: updated.id,
    status: "pending",
    message: "Archivo recibido correctamente"
  });
}

const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

function queryParseError(res: Response, result: z.SafeParseError<unknown>) {
  const first = result.error.errors[0];
  res.status(400).json({
    error: first?.message ?? "Invalid query parameters",
    path: first?.path
  });
}

export async function listChatImports(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const parsed = listJobsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    queryParseError(res, parsed);
    return;
  }
  const query = parsed.data;
  const result = await chatImportService.listJobs(businessId, query.page, query.limit);
  res.json({
    items: result.items.map(mapJob),
    total: result.total,
    page: result.page,
    limit: result.limit
  });
}

export async function getChatImport(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const importJobId = paramId(req, "importJobId");
  const job = await chatImportService.getJob(businessId, importJobId);
  if (!job) {
    res.status(404).json({ error: "Import job not found" });
    return;
  }
  res.json(mapJob(job));
}

export async function deleteChatImport(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const importJobId = paramId(req, "importJobId");

  try {
    const result = await chatImportService.deleteJob(businessId, importJobId);
    if (!result) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar";
    res.status(400).json({ error: message });
  }
}

const resetImportsSchema = z.object({
  remove_approved_faqs: z.boolean().optional()
});

export async function resetAllChatImports(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const body = resetImportsSchema.parse(req.body ?? {});

  try {
    const resetInput: { removeApprovedFaqs?: boolean } = {};
    if (body.remove_approved_faqs !== undefined) {
      resetInput.removeApprovedFaqs = body.remove_approved_faqs;
    }
    const result = await chatImportService.resetAllForTenant(businessId, resetInput);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo reiniciar";
    res.status(400).json({ error: message });
  }
}

const messagesQuerySchema = z.object({
  sender_role: z.enum(["customer", "business"]).optional(),
  is_question: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : undefined)),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1)
});

export async function listImportedMessages(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const importJobId = paramId(req, "importJobId");
  const job = await chatImportService.getJob(businessId, importJobId);
  if (!job) {
    res.status(404).json({ error: "Import job not found" });
    return;
  }

  const parsed = messagesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    queryParseError(res, parsed);
    return;
  }
  const query = parsed.data;
  const filters: {
    sender_role?: string;
    is_question?: boolean;
    limit: number;
    page: number;
  } = { limit: query.limit, page: query.page };
  if (query.sender_role) filters.sender_role = query.sender_role;
  if (query.is_question) filters.is_question = query.is_question;
  const result = await chatImportService.listMessages(businessId, importJobId, filters);

  res.json({
    items: result.items.map((m) => ({
      id: m.id,
      message_at: m.messageAt,
      sender_label: m.senderLabel,
      sender_role: m.senderRole.toLowerCase(),
      content: m.content,
      content_anonymized: m.contentAnonymized,
      is_question: m.isQuestion,
      is_business_response: m.isBusinessResponse
    })),
    total: result.total,
    page: result.page,
    limit: result.limit,
    sample_only: result.sample_only ?? false
  });
}

export async function listPendingFaqSuggestions(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const suggestions = await faqDetectionService.listPendingByTenant(businessId);
  res.json(
    suggestions.map((s) => ({
      id: s.id,
      import_job_id: s.importJobId,
      import_filename: s.importJob?.originalFilename
        ? decodeUploadedFilename(s.importJob.originalFilename)
        : null,
      question: s.question,
      suggested_answer: s.suggestedAnswer,
      category: s.category,
      evidence_count: s.evidenceCount,
      confidence: s.confidence,
      status: s.status.toLowerCase()
    }))
  );
}

export async function listFaqSuggestions(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const importJobId = paramId(req, "importJobId");
  const job = await chatImportService.getJob(businessId, importJobId);
  if (!job) {
    res.status(404).json({ error: "Import job not found" });
    return;
  }

  const suggestions = await faqDetectionService.listByImportJob(businessId, importJobId);
  res.json(
    suggestions.map((s) => ({
      id: s.id,
      question: s.question,
      suggested_answer: s.suggestedAnswer,
      category: s.category,
      evidence_count: s.evidenceCount,
      confidence: s.confidence,
      status: s.status.toLowerCase()
    }))
  );
}

export async function getToneAnalysis(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const importJobId = paramId(req, "importJobId");
  const job = await chatImportService.getJob(businessId, importJobId);
  if (!job) {
    res.status(404).json({ error: "Import job not found" });
    return;
  }

  const analysis = await toneAnalysisService.getByImportJob(businessId, importJobId);
  if (!analysis) {
    res.status(404).json({ error: "Tone analysis not found" });
    return;
  }

  res.json(toneAnalysisService.toApiPayload(analysis));
}
