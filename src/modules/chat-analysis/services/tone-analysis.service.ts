import type { Prisma, ToneAnalysisResult } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { decodeUploadedFilename } from "../../../utils/decode-filename.js";
import { chatAnalysisAiService } from "./chat-analysis-ai.service.js";
import type { ToneAnalysisAiResult } from "../types/tone-analysis-result.type.js";
import type {
  GreetingConfig,
  SuggestedGreeting
} from "../types/greeting-config.type.js";
import { DEFAULT_GREETING_CONFIG } from "../types/greeting-config.type.js";
import {
  mergeFillerWords,
  mergeSuggestedGreetings,
  syncRecommendedBotRules
} from "./tone-rules-sync.service.js";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizePhrases(phrases: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const phrase of phrases) {
    const normalized = phrase.trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result.slice(0, 20);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseSuggestedGreetings(rules: Record<string, unknown>): SuggestedGreeting[] {
  const raw = rules.suggested_greetings;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const greeting: SuggestedGreeting = {
        text: String(item.text ?? "").trim(),
        warmth: (["formal", "neutral", "warm"].includes(String(item.warmth))
          ? item.warmth
          : "neutral") as SuggestedGreeting["warmth"],
        source: String(item.source ?? "chat")
      };
      if (typeof item.usage_count === "number") {
        greeting.usage_count = item.usage_count;
      }
      return greeting;
    })
    .filter((item) => item.text.length > 0);
}

function parseFillerWords(rules: Record<string, unknown>): string[] {
  return asStringArray(rules.filler_words);
}

function parseGreetingConfig(rules: Record<string, unknown>): GreetingConfig {
  const raw = rules.greeting_config;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_GREETING_CONFIG;
  }
  const cfg = raw as Record<string, unknown>;
  return {
    new_customer_warmth:
      cfg.new_customer_warmth === "formal" ||
      cfg.new_customer_warmth === "warm" ||
      cfg.new_customer_warmth === "neutral"
        ? cfg.new_customer_warmth
        : DEFAULT_GREETING_CONFIG.new_customer_warmth,
    returning_customer_warmth:
      cfg.returning_customer_warmth === "formal" ||
      cfg.returning_customer_warmth === "warm" ||
      cfg.returning_customer_warmth === "neutral"
        ? cfg.returning_customer_warmth
        : DEFAULT_GREETING_CONFIG.returning_customer_warmth,
    returning_min_messages:
      typeof cfg.returning_min_messages === "number" && cfg.returning_min_messages > 0
        ? cfg.returning_min_messages
        : DEFAULT_GREETING_CONFIG.returning_min_messages,
    combine_greeting_with_answers:
      typeof cfg.combine_greeting_with_answers === "boolean"
        ? cfg.combine_greeting_with_answers
        : DEFAULT_GREETING_CONFIG.combine_greeting_with_answers
  };
}

function enrichTonePayload<T extends Record<string, unknown>>(merged: T) {
  const synced = syncRecommendedBotRules(
    {
      tone_summary: "",
      communication_style: "",
      common_phrases: [],
      emoji_usage: (merged.emoji_usage as ToneAnalysisAiResult["emoji_usage"]) ?? "moderate",
      response_length: (merged.response_length as ToneAnalysisAiResult["response_length"]) ?? "medium",
      sales_style: String(merged.sales_style ?? ""),
      formality_level: "semi_formal",
      recommended_bot_rules: merged.recommended_bot_rules as Record<string, unknown>,
      confidence: 0
    },
    {
      suggested_greetings: parseSuggestedGreetings(
        merged.recommended_bot_rules as Record<string, unknown>
      ),
      filler_words: parseFillerWords(merged.recommended_bot_rules as Record<string, unknown>),
      greeting_config: parseGreetingConfig(merged.recommended_bot_rules as Record<string, unknown>)
    }
  );

  return {
    ...merged,
    recommended_bot_rules: synced,
    suggested_greetings: parseSuggestedGreetings(synced as Record<string, unknown>),
    filler_words: parseFillerWords(synced as Record<string, unknown>),
    greeting_config: parseGreetingConfig(synced as Record<string, unknown>)
  };
}

function pickMostCommon(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best?.value ?? null;
}

export class ToneAnalysisService {
  async saveFromAi(input: {
    tenantId: string;
    importJobId: string;
    result: ToneAnalysisAiResult;
  }) {
    return prisma.toneAnalysisResult.create({
      data: {
        tenantId: input.tenantId,
        importJobId: input.importJobId,
        toneSummary: input.result.tone_summary,
        communicationStyle: input.result.communication_style,
        commonPhrases: input.result.common_phrases,
        emojiUsage: input.result.emoji_usage,
        responseLength: input.result.response_length,
        salesStyle: input.result.sales_style,
        formalityLevel: input.result.formality_level,
        recommendedBotRules: input.result.recommended_bot_rules as Prisma.InputJsonValue,
        confidence: input.result.confidence
      }
    });
  }

  async getByImportJob(tenantId: string, importJobId: string) {
    return prisma.toneAnalysisResult.findFirst({
      where: { tenantId, importJobId },
      orderBy: { createdAt: "desc" }
    });
  }

  toApiPayload(analysis: ToneAnalysisResult) {
    return enrichTonePayload({
      id: analysis.id,
      tone_summary: analysis.toneSummary,
      communication_style: analysis.communicationStyle,
      common_phrases: asStringArray(analysis.commonPhrases),
      emoji_usage: analysis.emojiUsage,
      response_length: analysis.responseLength,
      sales_style: analysis.salesStyle,
      formality_level: analysis.formalityLevel,
      recommended_bot_rules: asRecord(analysis.recommendedBotRules),
      confidence: analysis.confidence,
      status: analysis.status.toLowerCase()
    });
  }

  async listPendingForConsolidation(tenantId: string) {
    return prisma.toneAnalysisResult.findMany({
      where: {
        tenantId,
        status: "PENDING_REVIEW",
        importJob: { status: "COMPLETED" }
      },
      include: {
        importJob: { select: { id: true, originalFilename: true, completedAt: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  mergeAnalyses(
    analyses: Array<
      ToneAnalysisResult & {
        importJob?: { id: string; originalFilename: string; completedAt: Date | null } | null;
      }
    >
  ) {
    if (!analyses.length) return null;
    const first = analyses[0]!;
    if (analyses.length === 1) {
      return enrichTonePayload({
        id: first.id,
        is_consolidated: false,
        source_tone_analysis_ids: [first.id],
        source_import_jobs: first.importJob
          ? [{
              id: first.importJob.id,
              filename: decodeUploadedFilename(first.importJob.originalFilename)
            }]
          : first.importJobId
            ? [{ id: first.importJobId, filename: null }]
            : [],
        tone_summary: first.toneSummary,
        communication_style: first.communicationStyle,
        common_phrases: asStringArray(first.commonPhrases),
        emoji_usage: first.emojiUsage,
        response_length: first.responseLength,
        sales_style: first.salesStyle,
        formality_level: first.formalityLevel,
        recommended_bot_rules: asRecord(first.recommendedBotRules),
        confidence: first.confidence,
        status: first.status.toLowerCase()
      });
    }

    const phrases = [
      ...new Set(analyses.flatMap((a) => asStringArray(a.commonPhrases)))
    ].slice(0, 20);

    const mergedRules = analyses.reduce<Record<string, unknown>>((acc, analysis) => {
      return { ...acc, ...asRecord(analysis.recommendedBotRules) };
    }, {});

    const greetingLists = analyses.map((a) =>
      parseSuggestedGreetings(asRecord(a.recommendedBotRules))
    );
    const fillerLists = analyses.map((a) =>
      parseFillerWords(asRecord(a.recommendedBotRules))
    );
    mergedRules.suggested_greetings = mergeSuggestedGreetings(greetingLists);
    mergedRules.filler_words = mergeFillerWords(fillerLists);

    const avgConfidence =
      analyses.reduce((sum, a) => sum + (a.confidence ?? 0), 0) / analyses.length;

    return enrichTonePayload({
      id: "consolidated",
      is_consolidated: true,
      source_tone_analysis_ids: analyses.map((a) => a.id),
      source_import_jobs: analyses
        .filter((a) => a.importJobId)
        .map((a) => ({
          id: a.importJobId!,
          filename: a.importJob?.originalFilename
            ? decodeUploadedFilename(a.importJob.originalFilename)
            : null
        })),
      tone_summary: analyses.map((a) => a.toneSummary).join(" "),
      communication_style: pickMostCommon(analyses.map((a) => a.communicationStyle)),
      common_phrases: phrases,
      emoji_usage: pickMostCommon(analyses.map((a) => a.emojiUsage)),
      response_length: pickMostCommon(analyses.map((a) => a.responseLength)),
      sales_style: pickMostCommon(analyses.map((a) => a.salesStyle)),
      formality_level: pickMostCommon(analyses.map((a) => a.formalityLevel)),
      recommended_bot_rules: mergedRules,
      confidence: avgConfidence,
      status: "pending_review"
    });
  }

  async getConsolidated(tenantId: string, useAi = false) {
    const analyses = await this.listPendingForConsolidation(tenantId);
    if (!analyses.length) return null;

    if (useAi && analyses.length > 1) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const aiResult = await chatAnalysisAiService.consolidateTone(
        analyses.map((a) => ({
          tone_summary: a.toneSummary,
          common_phrases: asStringArray(a.commonPhrases)
        })),
        tenant?.defaultAiModel
      );
      const merged = this.mergeAnalyses(analyses);
      if (!merged) return null;
      return enrichTonePayload({
        ...merged,
        tone_summary: aiResult.tone_summary,
        communication_style: aiResult.communication_style ?? merged.communication_style,
        common_phrases: aiResult.common_phrases ?? merged.common_phrases,
        emoji_usage: aiResult.emoji_usage ?? merged.emoji_usage,
        response_length: aiResult.response_length ?? merged.response_length,
        sales_style: aiResult.sales_style ?? merged.sales_style,
        formality_level: aiResult.formality_level ?? merged.formality_level,
        recommended_bot_rules: {
          ...merged.recommended_bot_rules,
          ...(aiResult.recommended_bot_rules ?? {}),
          suggested_greetings:
            aiResult.suggested_greetings ??
            merged.recommended_bot_rules.suggested_greetings,
          filler_words:
            aiResult.filler_words ?? merged.recommended_bot_rules.filler_words
        },
        confidence: aiResult.confidence ?? merged.confidence
      });
    }

    return this.mergeAnalyses(analyses);
  }

  async approve(input: {
    tenantId: string;
    toneAnalysisId: string;
    toneSummary?: string;
    commonPhrases?: string[];
    rules?: Record<string, unknown>;
    reviewedBy?: string;
  }) {
    const analysis = await prisma.toneAnalysisResult.findFirst({
      where: { id: input.toneAnalysisId, tenantId: input.tenantId }
    });
    if (!analysis) {
      return null;
    }

    const finalSummary = input.toneSummary ?? analysis.toneSummary;
    const finalPhrases = normalizePhrases(
      input.commonPhrases ?? asStringArray(analysis.commonPhrases)
    );
    const baseRules =
      analysis.recommendedBotRules && typeof analysis.recommendedBotRules === "object"
        ? (analysis.recommendedBotRules as Record<string, unknown>)
        : {};
    const finalRules = { ...baseRules, ...(input.rules ?? {}) };

    const config = await prisma.tenantConfig.findUnique({
      where: { tenantId: input.tenantId }
    });
    if (!config) {
      return null;
    }

    const configJson =
      config.configJson && typeof config.configJson === "object" && !Array.isArray(config.configJson)
        ? (config.configJson as Record<string, unknown>)
        : {};

    await prisma.$transaction([
      prisma.toneAnalysisResult.update({
        where: { id: analysis.id },
        data: {
          status: "APPROVED",
          toneSummary: finalSummary,
          commonPhrases: finalPhrases,
          recommendedBotRules: finalRules as Prisma.InputJsonValue,
          reviewedBy: input.reviewedBy ?? null,
          reviewedAt: new Date()
        }
      }),
      prisma.tenantConfig.update({
        where: { tenantId: input.tenantId },
        data: {
          botTone: finalSummary,
          configJson: {
            ...configJson,
            toneRules: finalRules,
            toneCommonPhrases: finalPhrases,
            toneGreetings: parseSuggestedGreetings(finalRules),
            toneGreetingConfig: parseGreetingConfig(finalRules)
          } as Prisma.InputJsonValue
        }
      })
    ]);

    return prisma.toneAnalysisResult.findUnique({ where: { id: analysis.id } });
  }

  async approveConsolidated(input: {
    tenantId: string;
    toneSummary?: string;
    commonPhrases?: string[];
    rules?: Record<string, unknown>;
    reviewedBy?: string;
  }) {
    const analyses = await this.listPendingForConsolidation(input.tenantId);
    if (!analyses.length) return null;

    const consolidated = await this.getConsolidated(input.tenantId, true);
    if (!consolidated) return null;

    const finalSummary = input.toneSummary ?? consolidated.tone_summary;
    const finalPhrases = normalizePhrases(
      input.commonPhrases ?? consolidated.common_phrases
    );
    const finalRules = {
      ...consolidated.recommended_bot_rules,
      ...(input.rules ?? {})
    };

    const config = await prisma.tenantConfig.findUnique({
      where: { tenantId: input.tenantId }
    });
    if (!config) return null;

    const configJson =
      config.configJson && typeof config.configJson === "object" && !Array.isArray(config.configJson)
        ? (config.configJson as Record<string, unknown>)
        : {};

    await prisma.$transaction([
      ...analyses.map((analysis) =>
        prisma.toneAnalysisResult.update({
          where: { id: analysis.id },
          data: {
            status: "APPROVED",
            toneSummary: finalSummary,
            commonPhrases: finalPhrases,
            recommendedBotRules: finalRules as Prisma.InputJsonValue,
            reviewedBy: input.reviewedBy ?? null,
            reviewedAt: new Date()
          }
        })
      ),
      prisma.tenantConfig.update({
        where: { tenantId: input.tenantId },
        data: {
          botTone: finalSummary,
          configJson: {
            ...configJson,
            toneRules: finalRules,
            toneCommonPhrases: finalPhrases,
            toneGreetings: parseSuggestedGreetings(finalRules),
            toneGreetingConfig: parseGreetingConfig(finalRules),
            toneConsolidatedFrom: consolidated.source_import_jobs
          } as Prisma.InputJsonValue
        }
      })
    ]);

    return {
      status: "approved",
      tone_summary: finalSummary,
      common_phrases: finalPhrases,
      recommended_bot_rules: finalRules,
      source_import_jobs: consolidated.source_import_jobs
    };
  }
}

export const toneAnalysisService = new ToneAnalysisService();
