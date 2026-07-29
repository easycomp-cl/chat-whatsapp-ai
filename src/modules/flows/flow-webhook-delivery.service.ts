import { FlowWebhookDeliveryStatus, Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { FlowHttpError } from "./flows.errors.js";
import {
  buildConversAiOutboundHeaders,
  truncateResponseBody
} from "./flow-webhook-outbound.utils.js";
import { flowWebhookIntegrationService } from "./flow-webhook-integration.service.js";
import { enqueueFlowWebhookDelivery } from "../queue/flow-webhook-delivery.queue.js";

export class FlowWebhookDeliveryService {
  async scheduleFromFlowEvent(input: {
    tenantId: string;
    flowRunId: string;
    flowRunEventId: string;
    nodeId: string;
    eventType: string;
    payload: Record<string, unknown>;
    nodeConfig?: Record<string, unknown>;
  }) {
    const integration = await flowWebhookIntegrationService.getIntegration(input.tenantId);
    if (!integration || !integration.hasSecret) {
      logger.debug(
        { tenantId: input.tenantId, eventType: input.eventType },
        "emit_event sin integración FLOW_WEBHOOK configurada; se omite entrega"
      );
      return null;
    }

    if (!flowWebhookIntegrationService.isEventAllowed(integration.config, input.eventType)) {
      logger.debug(
        { tenantId: input.tenantId, eventType: input.eventType },
        "emit_event filtrado por configuración de eventos del webhook"
      );
      return null;
    }

    const nodeWebhookUrl =
      typeof input.nodeConfig?.webhookUrl === "string" ? input.nodeConfig.webhookUrl : undefined;
    const targetUrl = nodeWebhookUrl ?? integration.config.url;

    if (!targetUrl) {
      return null;
    }

    const delivery = await prisma.flowWebhookDelivery.create({
      data: {
        tenantId: input.tenantId,
        flowRunId: input.flowRunId,
        flowRunEventId: input.flowRunEventId,
        nodeId: input.nodeId,
        eventType: input.eventType,
        targetUrl,
        payloadJson: input.payload as Prisma.InputJsonValue,
        maxAttempts: env.FLOW_WEBHOOK_MAX_ATTEMPTS
      }
    });

    await enqueueFlowWebhookDelivery(delivery.id);
    return delivery;
  }

  async executeDelivery(deliveryId: string) {
    const delivery = await prisma.flowWebhookDelivery.findUnique({
      where: { id: deliveryId }
    });

    if (!delivery) {
      throw new FlowHttpError("Entrega webhook no encontrada", 404);
    }

    if (delivery.status === FlowWebhookDeliveryStatus.DELIVERED) {
      return delivery;
    }

    if (delivery.attemptCount >= delivery.maxAttempts) {
      return prisma.flowWebhookDelivery.update({
        where: { id: delivery.id },
        data: { status: FlowWebhookDeliveryStatus.DEAD_LETTER }
      });
    }

    const integration = await flowWebhookIntegrationService.getIntegration(delivery.tenantId);
    if (!integration) {
      throw new FlowHttpError("Integración webhook no configurada", 503, "webhook_integration_missing");
    }

    const secret = flowWebhookIntegrationService.resolveSigningSecret(integration.integration);
    const attemptNumber = delivery.attemptCount + 1;
    const body = JSON.stringify(delivery.payloadJson);
    const headers = buildConversAiOutboundHeaders({
      deliveryId: delivery.id,
      eventType: delivery.eventType,
      secret,
      body
    });

    await prisma.flowWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: FlowWebhookDeliveryStatus.DELIVERING,
        attemptCount: attemptNumber,
        lastAttemptAt: new Date()
      }
    });

    const startedAt = Date.now();
    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(delivery.targetUrl, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30_000)
      });

      httpStatus = response.status;
      responseBody = truncateResponseBody(await response.text());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseBody}`);
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.flowWebhookDeliveryAttempt.create({
          data: {
            deliveryId: delivery.id,
            attemptNumber,
            httpStatus,
            responseBody,
            durationMs: Date.now() - startedAt
          }
        });

        return tx.flowWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: FlowWebhookDeliveryStatus.DELIVERED,
            lastHttpStatus: httpStatus,
            lastError: null,
            deliveredAt: new Date(),
            nextRetryAt: null
          }
        });
      });

      return updated;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Error desconocido";
      const isFinalAttempt = attemptNumber >= delivery.maxAttempts;

      const updated = await prisma.$transaction(async (tx) => {
        await tx.flowWebhookDeliveryAttempt.create({
          data: {
            deliveryId: delivery.id,
            attemptNumber,
            httpStatus,
            responseBody,
            errorMessage,
            durationMs: Date.now() - startedAt
          }
        });

        return tx.flowWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: isFinalAttempt
              ? FlowWebhookDeliveryStatus.DEAD_LETTER
              : FlowWebhookDeliveryStatus.FAILED,
            lastHttpStatus: httpStatus,
            lastError: errorMessage
          }
        });
      });

      if (!isFinalAttempt) {
        throw new FlowHttpError(errorMessage, 502, "webhook_delivery_failed");
      }

      logger.error(
        { deliveryId: delivery.id, attemptNumber, error: errorMessage },
        "Webhook de flujo en dead letter"
      );
      return updated;
    }
  }

  async retryDelivery(tenantId: string, deliveryId: string) {
    const delivery = await prisma.flowWebhookDelivery.findFirst({
      where: { id: deliveryId, tenantId }
    });

    if (!delivery) {
      throw new FlowHttpError("Entrega webhook no encontrada", 404);
    }

    if (delivery.status === FlowWebhookDeliveryStatus.DELIVERED) {
      return delivery;
    }

    await prisma.flowWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: FlowWebhookDeliveryStatus.PENDING,
        attemptCount: 0,
        lastError: null,
        lastHttpStatus: null,
        nextRetryAt: null,
        deliveredAt: null
      }
    });

    await enqueueFlowWebhookDelivery(delivery.id, { force: true });
    return prisma.flowWebhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  }

  async listDeliveries(tenantId: string, query?: { status?: string; flowRunId?: string; limit?: number }) {
    const limit = Math.min(Math.max(query?.limit ?? 50, 1), 200);

    return prisma.flowWebhookDelivery.findMany({
      where: {
        tenantId,
        ...(query?.status ? { status: query.status as FlowWebhookDeliveryStatus } : {}),
        ...(query?.flowRunId ? { flowRunId: query.flowRunId } : {})
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 5
        }
      }
    });
  }

  async getDelivery(tenantId: string, deliveryId: string) {
    const delivery = await prisma.flowWebhookDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      include: {
        attempts: {
          orderBy: { attemptNumber: "asc" }
        }
      }
    });

    if (!delivery) {
      throw new FlowHttpError("Entrega webhook no encontrada", 404);
    }

    return delivery;
  }
}

export const flowWebhookDeliveryService = new FlowWebhookDeliveryService();
