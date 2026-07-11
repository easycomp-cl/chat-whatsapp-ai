import type { Request, Response } from "express";
import { z } from "zod";
import { paramId } from "../../../utils/params.js";
import { faqDetectionService } from "../services/faq-detection.service.js";

const approveSchema = z.object({
  final_question: z.string().min(1).optional(),
  final_answer: z.string().min(1).optional()
});

const updateSchema = z.object({
  question: z.string().min(1).optional(),
  suggested_answer: z.string().min(1).optional(),
  category: z.string().optional()
});

export async function approveFaqSuggestion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const suggestionId = paramId(req, "suggestionId");
  const body = approveSchema.parse(req.body ?? {});

  try {
    const approveInput: {
      tenantId: string;
      suggestionId: string;
      finalQuestion?: string;
      finalAnswer?: string;
    } = { tenantId: businessId, suggestionId };
    if (body.final_question) approveInput.finalQuestion = body.final_question;
    if (body.final_answer) approveInput.finalAnswer = body.final_answer;
    const updated = await faqDetectionService.approve(approveInput);
    if (!updated) {
      res.status(404).json({ error: "FAQ suggestion not found" });
      return;
    }
    res.json({
      id: updated.id,
      status: updated.status.toLowerCase(),
      question: updated.question,
      suggested_answer: updated.suggestedAnswer
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al aprobar FAQ";
    res.status(400).json({ error: message });
  }
}

export async function updateFaqSuggestion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const suggestionId = paramId(req, "suggestionId");
  const body = updateSchema.parse(req.body);

  const patch: { question?: string; suggested_answer?: string; category?: string } = {};
  if (body.question) patch.question = body.question;
  if (body.suggested_answer) patch.suggested_answer = body.suggested_answer;
  if (body.category !== undefined) patch.category = body.category;
  const updated = await faqDetectionService.updateSuggestion(businessId, suggestionId, patch);
  if (!updated) {
    res.status(404).json({ error: "FAQ suggestion not found" });
    return;
  }

  res.json({
    id: updated.id,
    question: updated.question,
    suggested_answer: updated.suggestedAnswer,
    category: updated.category,
    status: updated.status.toLowerCase()
  });
}

export async function rejectFaqSuggestion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const suggestionId = paramId(req, "suggestionId");

  const updated = await faqDetectionService.reject(businessId, suggestionId);
  if (!updated) {
    res.status(404).json({ error: "FAQ suggestion not found" });
    return;
  }

  res.json({ status: "rejected" });
}
