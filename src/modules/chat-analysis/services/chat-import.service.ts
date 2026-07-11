import AdmZip from "adm-zip";
import type { ChatImportJob, ChatSenderRole, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { normalizeForMatch } from "../../../utils/direct-match.js";
import { removeChatImportFromQueue } from "../../queue/chat-import-analysis.queue.js";
import { storageService } from "../../storage/storage.service.js";
import { chatAnonymizerService } from "./chat-anonymizer.service.js";
import { chatAnalysisAiService } from "./chat-analysis-ai.service.js";
import { faqDetectionService } from "./faq-detection.service.js";
import { toneAnalysisService } from "./tone-analysis.service.js";
import { greetingExtractorService } from "./greeting-extractor.service.js";
import { syncRecommendedBotRules } from "./tone-rules-sync.service.js";
import { whatsappChatParserService } from "./whatsapp-chat-parser.service.js";
import type { ParsedChatMessage } from "../types/parsed-chat-message.type.js";

const QUESTION_PATTERN =
  /^(?:¿|\?|cu[aá]nto|cu[aá]l|c[oó]mo|d[oó]nde|cu[aá]ndo|qui[eé]n|tienen|hay|aceptan|puedo|podr[ií]a|me pueden|informaci[oó]n)/i;

const MAX_BUSINESS_SAMPLE = 12;
const FAQ_CHUNK_SIZE = 400;
const FAQ_CHUNK_COUNT = 3;
export const MAX_IMPORT_JOBS_PER_TENANT = 10;

function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith("?") || trimmed.endsWith("¿") || QUESTION_PATTERN.test(trimmed);
}

function resolveSenderRole(
  sender: string,
  businessSenderName?: string | null
): ChatSenderRole {
  if (businessSenderName && sender.trim().toLowerCase() === businessSenderName.trim().toLowerCase()) {
    return "BUSINESS";
  }
  return "UNKNOWN";
}

function inferBusinessSender(messages: ParsedChatMessage[]): string | null {
  const senderStats = new Map<string, { responses: number; total: number }>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    const stats = senderStats.get(msg.sender) ?? { responses: 0, total: 0 };
    stats.total += 1;
    const prev = messages[i - 1];
    if (prev && isQuestion(prev.message)) {
      stats.responses += 1;
    }
    senderStats.set(msg.sender, stats);
  }

  let best: { sender: string; score: number } | null = null;
  for (const [sender, stats] of senderStats) {
    const score = stats.responses * 2 + stats.total;
    if (!best || score > best.score) {
      best = { sender, score };
    }
  }
  return best?.sender ?? null;
}

function extractTextFromFile(buffer: Buffer, filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) {
    const zip = new AdmZip(buffer);
    const txtEntry = zip
      .getEntries()
      .find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".txt"));
    if (!txtEntry) {
      throw new Error("El archivo ZIP no contiene un .txt válido");
    }
    return txtEntry.getData().toString("utf8");
  }
  return buffer.toString("utf8");
}

type FaqSampleRow = {
  senderRole: ChatSenderRole;
  senderLabel: string | null;
  contentAnonymized: string | null;
  isQuestion: boolean;
};

function buildConversationSample(messages: FaqSampleRow[]): string {
  return messages
    .map((m) => {
      const role = m.senderRole === "BUSINESS" ? "business" : m.senderRole === "CUSTOMER" ? "customer" : "unknown";
      const prefix = m.isQuestion ? "[PREGUNTA]" : "";
      return `${prefix}[${role}] ${m.senderLabel ?? "?"}: ${m.contentAnonymized ?? ""}`;
    })
    .join("\n");
}

function mapParsedToFaqRows(parsed: ParsedChatMessage[], businessName: string | null): FaqSampleRow[] {
  return parsed.map((msg) => {
    let senderRole = resolveSenderRole(msg.sender, businessName);
    if (senderRole === "UNKNOWN" && businessName && msg.sender !== businessName) {
      senderRole = "CUSTOMER";
    }
    return {
      senderRole,
      senderLabel: msg.sender,
      contentAnonymized: chatAnonymizerService.anonymize(msg.message),
      isQuestion: isQuestion(msg.message)
    };
  });
}

function buildFaqSampleSlices(rows: FaqSampleRow[]): string[] {
  if (rows.length <= FAQ_CHUNK_SIZE) {
    return [buildConversationSample(rows)];
  }

  const starts = [
    0,
    Math.max(0, Math.floor(rows.length / 2) - Math.floor(FAQ_CHUNK_SIZE / 2)),
    Math.max(0, rows.length - FAQ_CHUNK_SIZE)
  ];
  const uniqueStarts = [...new Set(starts)].slice(0, FAQ_CHUNK_COUNT);

  return uniqueStarts.map((start) =>
    buildConversationSample(rows.slice(start, start + FAQ_CHUNK_SIZE))
  );
}

async function purgeImportFile(storagePath: string | null | undefined, jobId: string) {
  if (!storagePath) return;
  await storageService.deleteByStoragePath(storagePath);
  await prisma.chatImportJob.update({
    where: { id: jobId },
    data: { storagePath: null, fileUrl: "" }
  });
}

async function setJobProgress(jobId: string, percent: number, step: string) {
  const current = await prisma.chatImportJob.findUnique({
    where: { id: jobId },
    select: { metadata: true }
  });
  const base =
    current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? (current.metadata as Record<string, unknown>)
      : {};

  await prisma.chatImportJob.update({
    where: { id: jobId },
    data: {
      metadata: {
        ...base,
        progress_percent: percent,
        progress_step: step
      } as Prisma.InputJsonValue
    }
  });
}

export class ChatImportService {
  async processJob(importJobId: string): Promise<void> {
    const job = await prisma.chatImportJob.findUnique({ where: { id: importJobId } });
    if (!job) {
      throw new Error("Import job not found");
    }

    if (job.status === "COMPLETED") {
      return;
    }

    if (job.status === "FAILED") {
      return;
    }

    if (!job.storagePath) {
      await prisma.chatImportJob.update({
        where: { id: importJobId },
        data: {
          status: "FAILED",
          errorMessage:
            "El archivo ya no está disponible. Vuelve a subir el chat.",
          completedAt: new Date()
        }
      });
      return;
    }

    const storagePath = job.storagePath;

    await prisma.chatImportJob.update({
      where: { id: importJobId },
      data: { status: "PROCESSING", startedAt: new Date(), errorMessage: null }
    });
    await setJobProgress(importJobId, 10, "Leyendo archivo…");

    try {
      const buffer = await storageService.readByStoragePath(storagePath);
      const rawText = extractTextFromFile(buffer, job.originalFilename);
      if (!rawText.trim()) {
        throw new Error("El archivo está vacío");
      }

      const parsed = whatsappChatParserService.parse(rawText);
      if (!parsed.length) {
        throw new Error("No se encontraron mensajes parseables en el archivo");
      }
      await setJobProgress(importJobId, 30, "Mensajes detectados, analizando tono…");

      let businessName = job.businessSenderName;
      if (!businessName) {
        businessName = inferBusinessSender(parsed);
      }

      const messageRows = parsed.map((msg) => {
        let senderRole = resolveSenderRole(msg.sender, businessName);
        if (senderRole === "UNKNOWN" && businessName && msg.sender !== businessName) {
          senderRole = "CUSTOMER";
        }
        const content = msg.message;
        const contentAnonymized = chatAnonymizerService.anonymize(content);
        const question = isQuestion(content);
        return {
          senderRole,
          contentAnonymized,
          isQuestion: question,
          isBusinessResponse: senderRole === "BUSINESS" && !question
        };
      });

      const customerCount = messageRows.filter((m) => m.senderRole === "CUSTOMER").length;
      const businessCount = messageRows.filter((m) => m.senderRole === "BUSINESS").length;

      const businessTexts = messageRows
        .filter((m) => m.senderRole === "BUSINESS")
        .map((m) => m.contentAnonymized ?? "")
        .filter(Boolean);

      const businessSample = businessTexts.slice(0, MAX_BUSINESS_SAMPLE);

      const tenant = await prisma.tenant.findUnique({ where: { id: job.tenantId } });
      const model = tenant?.defaultAiModel;

      const toneResult = await chatAnalysisAiService.analyzeTone(businessTexts, model);

      const sourceLabel = businessName ?? job.originalFilename;
      const extractedGreetings = greetingExtractorService.extractFromChat({
        messages: parsed,
        businessSenderName: businessName ?? inferBusinessSender(parsed) ?? "Negocio",
        sourceLabel
      });
      const extractedFillers = greetingExtractorService.extractFillerWords(businessTexts);

      const mergedGreetings = [
        ...(toneResult.suggested_greetings ?? []),
        ...extractedGreetings
      ];
      const mergedFillers = [
        ...(toneResult.filler_words ?? []),
        ...extractedFillers
      ];

      toneResult.recommended_bot_rules = syncRecommendedBotRules(toneResult, {
        suggested_greetings: mergedGreetings,
        filler_words: [...new Set(mergedFillers)]
      });
      toneResult.suggested_greetings = toneResult.recommended_bot_rules.suggested_greetings as typeof extractedGreetings;
      toneResult.filler_words = toneResult.recommended_bot_rules.filler_words as string[];

      const toneRecord = await toneAnalysisService.saveFromAi({
        tenantId: job.tenantId,
        importJobId: job.id,
        result: toneResult
      });
      await setJobProgress(importJobId, 60, "Tono analizado, detectando FAQs…");

      const faqSampleRows = mapParsedToFaqRows(parsed, businessName);
      const faqSlices = buildFaqSampleSlices(faqSampleRows);
      const faqResult = await chatAnalysisAiService.detectFaqsFromSamples(faqSlices, model);
      const faqRecords = await faqDetectionService.saveFromAi({
        tenantId: job.tenantId,
        importJobId: job.id,
        result: faqResult
      });
      await setJobProgress(importJobId, 90, "Finalizando…");

      await prisma.chatImportJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          totalMessages: messageRows.length,
          customerMessagesCount: customerCount,
          businessMessagesCount: businessCount,
          detectedFaqCount: faqRecords.length,
          detectedToneSummary: toneRecord.toneSummary,
          businessSenderName: businessName,
          metadata: {
            business_message_sample: businessSample,
            retention: "minimal",
            faq_analysis: {
              total_messages: messageRows.length,
              messages_sampled_for_faqs: Math.min(
                messageRows.length,
                faqSlices.length * FAQ_CHUNK_SIZE
              ),
              sample_chunks: faqSlices.length
            },
            progress_percent: 100,
            progress_step: "Completado"
          } satisfies Prisma.InputJsonValue
        }
      });

      await purgeImportFile(storagePath, job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      await prisma.chatImportJob.update({
        where: { id: importJobId },
        data: {
          status: "FAILED",
          errorMessage: message,
          completedAt: new Date(),
          metadata: {
            progress_percent: 0,
            progress_step: "Error"
          } as Prisma.InputJsonValue
        }
      });
      throw error;
    }
  }

  async getJobById(importJobId: string) {
    return prisma.chatImportJob.findUnique({ where: { id: importJobId } });
  }

  async purgeImportFilePublic(storagePath: string, jobId: string) {
    await purgeImportFile(storagePath, jobId);
  }

  async getJob(tenantId: string, importJobId: string) {
    return prisma.chatImportJob.findFirst({
      where: { id: importJobId, tenantId }
    });
  }

  private async deleteJobRecord(job: ChatImportJob) {
    if (job.storagePath) {
      await purgeImportFile(job.storagePath, job.id);
    }
    if (job.status === "PENDING") {
      await removeChatImportFromQueue(job.id);
    }
    await prisma.chatImportJob.delete({ where: { id: job.id } });
  }

  async enforceMaxJobs(tenantId: string, max = MAX_IMPORT_JOBS_PER_TENANT) {
    const jobs = await prisma.chatImportJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" }
    });

    if (jobs.length < max) {
      return;
    }

    const slotsNeeded = jobs.length - max + 1;
    let removed = 0;

    for (const job of jobs) {
      if (removed >= slotsNeeded) {
        break;
      }
      if (job.status === "PROCESSING") {
        continue;
      }
      await this.deleteJobRecord(job);
      removed++;
    }

    const remaining = await prisma.chatImportJob.count({ where: { tenantId } });
    if (remaining >= max) {
      throw new Error(
        `Máximo ${max} importaciones. Elimina alguna del historial o espera a que terminen las que están en análisis.`
      );
    }
  }

  async deleteJob(tenantId: string, importJobId: string) {
    const job = await prisma.chatImportJob.findFirst({
      where: { id: importJobId, tenantId }
    });
    if (!job) {
      return null;
    }
    if (job.status === "PROCESSING") {
      throw new Error("No se puede eliminar mientras se está analizando");
    }
    await this.deleteJobRecord(job);
    return { deleted: true };
  }

  async resetAllForTenant(
    tenantId: string,
    options: { removeApprovedFaqs?: boolean } = {}
  ) {
    const removeApprovedFaqs = options.removeApprovedFaqs !== false;

    const processingCount = await prisma.chatImportJob.count({
      where: { tenantId, status: "PROCESSING" }
    });
    if (processingCount > 0) {
      throw new Error(
        "Hay un análisis en curso. Espera a que termine antes de borrar todo."
      );
    }

    const approvedSuggestions = await prisma.detectedFaqSuggestion.findMany({
      where: { tenantId, status: "APPROVED" },
      select: { question: true }
    });
    const approvedQuestionKeys = new Set(
      approvedSuggestions.map((item) => normalizeForMatch(item.question))
    );

    const jobs = await prisma.chatImportJob.findMany({ where: { tenantId } });
    for (const job of jobs) {
      await this.deleteJobRecord(job);
    }

    await prisma.importedChatMessage.deleteMany({ where: { tenantId } });
    await prisma.detectedFaqSuggestion.deleteMany({ where: { tenantId } });
    await prisma.toneAnalysisResult.deleteMany({ where: { tenantId } });

    let deletedFaqs = 0;
    if (removeApprovedFaqs && approvedQuestionKeys.size > 0) {
      const faqs = await prisma.tenantFaq.findMany({
        where: { tenantId },
        select: { id: true, question: true }
      });
      const faqIdsToDelete = faqs
        .filter((faq) => approvedQuestionKeys.has(normalizeForMatch(faq.question)))
        .map((faq) => faq.id);
      if (faqIdsToDelete.length > 0) {
        const result = await prisma.tenantFaq.deleteMany({
          where: { id: { in: faqIdsToDelete } }
        });
        deletedFaqs = result.count;
      }
    }

    const config = await prisma.tenantConfig.findUnique({ where: { tenantId } });
    let toneReset = false;
    if (config) {
      const configJson =
        config.configJson && typeof config.configJson === "object" && !Array.isArray(config.configJson)
          ? { ...(config.configJson as Record<string, unknown>) }
          : {};
      const hadToneData =
        "toneRules" in configJson ||
        "toneCommonPhrases" in configJson ||
        "toneGreetings" in configJson ||
        "toneGreetingConfig" in configJson ||
        "toneConsolidatedFrom" in configJson;

      delete configJson.toneRules;
      delete configJson.toneCommonPhrases;
      delete configJson.toneGreetings;
      delete configJson.toneGreetingConfig;
      delete configJson.toneConsolidatedFrom;

      await prisma.tenantConfig.update({
        where: { tenantId },
        data: {
          botTone: "profesional y cercano",
          configJson: configJson as Prisma.InputJsonValue
        }
      });
      toneReset = hadToneData || config.botTone !== "profesional y cercano";
    }

    return {
      deleted_jobs: jobs.length,
      deleted_faqs: deletedFaqs,
      tone_reset: toneReset
    };
  }

  async listJobs(tenantId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.chatImportJob.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.chatImportJob.count({ where: { tenantId } })
    ]);
    return { items, total, page, limit };
  }

  async getBusinessSample(tenantId: string, importJobId: string): Promise<string[]> {
    const job = await this.getJob(tenantId, importJobId);
    if (!job?.metadata || typeof job.metadata !== "object" || Array.isArray(job.metadata)) {
      return [];
    }
    const sample = (job.metadata as Record<string, unknown>).business_message_sample;
    if (!Array.isArray(sample)) return [];
    return sample.filter((line): line is string => typeof line === "string");
  }

  async listMessages(
    tenantId: string,
    importJobId: string,
    filters: {
      sender_role?: string;
      is_question?: boolean;
      limit: number;
      page: number;
    }
  ) {
    const sample = await this.getBusinessSample(tenantId, importJobId);
    const items = sample.map((content, index) => ({
      id: `sample-${index}`,
      messageAt: null,
      senderLabel: null,
      senderRole: "BUSINESS" as const,
      content: null,
      contentAnonymized: content,
      isQuestion: false,
      isBusinessResponse: true
    }));

    return {
      items: items.slice(0, filters.limit),
      total: items.length,
      page: 1,
      limit: filters.limit,
      sample_only: true
    };
  }
}

export const chatImportService = new ChatImportService();
