import type { Request, Response } from "express";
import { z } from "zod";
import { paramId } from "../../../utils/params.js";
import { toneAnalysisService } from "../services/tone-analysis.service.js";

const approveSchema = z.object({
  tone_summary: z.string().min(1).optional(),
  common_phrases: z.array(z.string().min(1)).optional(),
  rules: z.record(z.unknown()).optional()
});

export async function getConsolidatedToneAnalysis(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const useAi = req.query.ai === "true";

  const pendingCount = await toneAnalysisService.countPendingForConsolidation(businessId);
  if (pendingCount === 0) {
    res.status(404).json({ error: "Tone analysis not found" });
    return;
  }

  const consolidated = await toneAnalysisService.getConsolidated(businessId, useAi);
  if (!consolidated) {
    res.status(404).json({ error: "Tone analysis not found" });
    return;
  }

  res.json(consolidated);
}

export async function approveConsolidatedToneAnalysis(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const body = approveSchema.parse(req.body ?? {});

  const approveInput: {
    tenantId: string;
    toneSummary?: string;
    commonPhrases?: string[];
    rules?: Record<string, unknown>;
  } = { tenantId: businessId };
  if (body.tone_summary) approveInput.toneSummary = body.tone_summary;
  if (body.common_phrases) approveInput.commonPhrases = body.common_phrases;
  if (body.rules) approveInput.rules = body.rules;

  const updated = await toneAnalysisService.approveConsolidated(approveInput);
  if (!updated) {
    res.status(404).json({ error: "Tone analysis not found" });
    return;
  }

  res.json(updated);
}

export async function approveToneAnalysis(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const toneAnalysisId = paramId(req, "toneAnalysisId");
  const body = approveSchema.parse(req.body ?? {});

  const approveInput: {
    tenantId: string;
    toneAnalysisId: string;
    toneSummary?: string;
    commonPhrases?: string[];
    rules?: Record<string, unknown>;
  } = { tenantId: businessId, toneAnalysisId };
  if (body.tone_summary) approveInput.toneSummary = body.tone_summary;
  if (body.common_phrases) approveInput.commonPhrases = body.common_phrases;
  if (body.rules) approveInput.rules = body.rules;
  const updated = await toneAnalysisService.approve(approveInput);

  if (!updated) {
    res.status(404).json({ error: "Tone analysis not found" });
    return;
  }

  res.json({
    id: updated.id,
    status: updated.status.toLowerCase(),
    tone_summary: updated.toneSummary,
    recommended_bot_rules: updated.recommendedBotRules
  });
}
