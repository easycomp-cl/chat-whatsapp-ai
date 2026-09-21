import type { Request, Response } from "express";
import { paramId } from "../../utils/params.js";
import { onboardingCompleteSchema, onboardingPatchSchema } from "../onboarding/onboarding.schema.js";
import { ONBOARDING_PATCH_MAX_BYTES } from "../onboarding/onboarding.types.js";
import type { OnboardingPatch } from "../onboarding/onboarding.types.js";
import { onboardingService } from "../onboarding/onboarding.service.js";

function requestBodyBytes(req: Request): number {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (raw) return raw.length;
  return Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
}

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
  if (requestBodyBytes(req) > ONBOARDING_PATCH_MAX_BYTES) {
    res.status(413).json({
      error: "payload_too_large",
      message: "El borrador es demasiado grande. No envíes data URLs."
    });
    return;
  }

  const tenantId = paramId(req, "id");
  const body = onboardingPatchSchema.parse(req.body) as OnboardingPatch;
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
