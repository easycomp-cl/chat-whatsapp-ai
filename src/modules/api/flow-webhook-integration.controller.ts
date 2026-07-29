import type { Request, Response } from "express";
import { z } from "zod";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { flowWebhookIntegrationService } from "../flows/flow-webhook-integration.service.js";
import { FlowHttpError } from "../flows/flows.errors.js";

const upsertSchema = z.object({
  url: z.string().url(),
  enabled: z.boolean().optional(),
  events: z.array(z.string().min(1)).optional(),
  rotate_secret: z.boolean().optional(),
  webhook_secret: z.string().min(16).optional()
});

function handleFlowError(res: Response, error: unknown) {
  if (error instanceof FlowHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  throw error;
}

export async function getFlowWebhookIntegration(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const integration = await flowWebhookIntegrationService.getIntegration(businessId);
  if (!integration) {
    res.json({ configured: false });
    return;
  }

  res.json({
    configured: true,
    url: integration.config.url,
    enabled: integration.config.enabled,
    events: integration.config.events ?? null,
    has_secret: integration.hasSecret
  });
}

export async function upsertFlowWebhookIntegration(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  try {
    const body = upsertSchema.parse(req.body ?? {});
    const result = await flowWebhookIntegrationService.upsertIntegration(businessId, {
      url: body.url,
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.events !== undefined ? { events: body.events } : {}),
      ...(body.rotate_secret !== undefined ? { rotate_secret: body.rotate_secret } : {}),
      ...(body.webhook_secret !== undefined ? { webhook_secret: body.webhook_secret } : {})
    });
    res.json({ configured: true, ...result });
  } catch (error) {
    handleFlowError(res, error);
  }
}
