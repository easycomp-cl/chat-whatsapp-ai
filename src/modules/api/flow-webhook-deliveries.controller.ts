import type { Request, Response } from "express";
import { z } from "zod";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import {
  serializeFlowWebhookDelivery
} from "../flows/domain/flow-webhook-serializers.js";
import { flowWebhookDeliveryService } from "../flows/flow-webhook-delivery.service.js";
import { FlowHttpError } from "../flows/flows.errors.js";

const listQuerySchema = z.object({
  status: z.string().optional(),
  flow_run_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});

function handleFlowError(res: Response, error: unknown) {
  if (error instanceof FlowHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  throw error;
}

export async function listFlowWebhookDeliveries(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const query = listQuerySchema.parse(req.query);
  const deliveries = await flowWebhookDeliveryService.listDeliveries(businessId, {
    ...(query.status ? { status: query.status } : {}),
    ...(query.flow_run_id ? { flowRunId: query.flow_run_id } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {})
  });

  res.json(deliveries.map(serializeFlowWebhookDelivery));
}

export async function getFlowWebhookDelivery(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const deliveryId = paramId(req, "deliveryId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  try {
    const delivery = await flowWebhookDeliveryService.getDelivery(businessId, deliveryId);
    res.json(serializeFlowWebhookDelivery(delivery));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function retryFlowWebhookDelivery(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const deliveryId = paramId(req, "deliveryId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  try {
    const delivery = await flowWebhookDeliveryService.retryDelivery(businessId, deliveryId);
    res.json(serializeFlowWebhookDelivery(delivery));
  } catch (error) {
    handleFlowError(res, error);
  }
}
