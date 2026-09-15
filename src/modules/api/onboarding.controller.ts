import type { Request, Response } from "express";
import { paramId } from "../../utils/params.js";
import { onboardingCompleteSchema, onboardingPatchSchema } from "../onboarding/onboarding.schema.js";
import type { OnboardingDraft } from "../onboarding/onboarding.types.js";
import { onboardingService } from "../onboarding/onboarding.service.js";

export async function getSetupStatus(req: Request, res: Response) {
  const tenantId = paramId(req, "id");
  const status = await onboardingService.getSetupStatus(tenantId);
  if (!status) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(status);
}

export async function patchOnboarding(req: Request, res: Response) {
  const tenantId = paramId(req, "id");
  const body = onboardingPatchSchema.parse(req.body) as OnboardingDraft;
  const status = await onboardingService.patchDraft(tenantId, body);
  if (!status) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json(status);
}

export async function completeOnboarding(req: Request, res: Response) {
  const tenantId = paramId(req, "id");
  const body = onboardingCompleteSchema.parse(req.body ?? {});
  const result = await onboardingService.complete({
    tenantId,
    enableBot: body.enable_bot,
    handoffOnLowConfidence: body.handoff_on_low_confidence
  });

  if (result.error === "not_found") {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  if (result.error === "incomplete") {
    res.status(409).json({
      error: "onboarding_incomplete",
      missing_for_go_live: result.status?.missing_for_go_live ?? []
    });
    return;
  }

  res.json(result);
}
