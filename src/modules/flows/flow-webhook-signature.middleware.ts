import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import {
  getWebhookSecretFromTrigger,
  verifyConversAiSignature
} from "./flow-webhook.utils.js";

export type FlowWebhookRequest = Request & {
  flowWebhookTrigger?: {
    id: string;
    tenantId: string;
    flowVersionId: string;
  };
};

export async function validateFlowWebhookSignature(
  req: FlowWebhookRequest,
  res: Response,
  next: NextFunction
) {
  const triggerId =
    typeof req.params.triggerId === "string" ? req.params.triggerId : undefined;
  if (!triggerId) {
    res.status(400).json({ error: "triggerId requerido" });
    return;
  }

  const trigger = await prisma.flowTrigger.findUnique({
    where: { id: triggerId },
    select: {
      id: true,
      tenantId: true,
      flowVersionId: true,
      triggerType: true,
      isEnabled: true,
      configurationJson: true
    }
  });

  if (!trigger || trigger.triggerType !== "WEBHOOK" || !trigger.isEnabled) {
    res.status(404).json({ error: "Trigger webhook no encontrado" });
    return;
  }

  if (!env.SKIP_WEBHOOK_SIGNATURE) {
    const secret = getWebhookSecretFromTrigger(trigger.configurationJson);
    if (!secret) {
      res.status(503).json({
        error: "Webhook sin secreto configurado; republica la versión del flujo",
        code: "webhook_secret_missing"
      });
      return;
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "Raw body requerido para validar firma" });
      return;
    }

    const signature = req.headers["x-conversai-signature"];
    if (!verifyConversAiSignature(rawBody, typeof signature === "string" ? signature : undefined, secret)) {
      logger.warn({ triggerId }, "Invalid flow webhook signature");
      res.status(401).json({ error: "Firma inválida" });
      return;
    }
  }

  req.flowWebhookTrigger = {
    id: trigger.id,
    tenantId: trigger.tenantId,
    flowVersionId: trigger.flowVersionId
  };
  next();
}
