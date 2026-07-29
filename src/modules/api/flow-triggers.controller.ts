import type { Request, Response } from "express";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { flowTriggerStartService } from "../flows/flow-trigger-start.service.js";
import { FlowHttpError } from "../flows/flows.errors.js";

function handleFlowError(res: Response, error: unknown) {
  if (error instanceof FlowHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  throw error;
}

export async function startFlowByApi(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");

  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  try {
    const result = await flowTriggerStartService.startByApi({
      tenantId: businessId,
      flowDefinitionId: flowId,
      body: req.body ?? {}
    });
    res.status(201).json(result);
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function receiveFlowWebhook(req: Request, res: Response) {
  const triggerId = paramId(req, "triggerId");

  try {
    const idempotencyHeader = req.headers["x-conversai-idempotency-key"];
    const result = await flowTriggerStartService.startByWebhookTrigger({
      triggerId,
      body: req.body ?? {},
      ...(typeof idempotencyHeader === "string" ? { idempotencyKeyHeader: idempotencyHeader } : {})
    });
    res.status(201).json(result);
  } catch (error) {
    handleFlowError(res, error);
  }
}
