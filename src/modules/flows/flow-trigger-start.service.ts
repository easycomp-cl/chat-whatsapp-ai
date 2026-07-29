import { ConversationMode, ConversationStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { normalizePhone } from "../../utils/phone.js";
import { serializeFlowRun } from "./domain/flow-serializers.js";
import { flowDeliveryService } from "./flow-delivery.service.js";
import { flowEngineService } from "./flow-engine.service.js";
import { FlowHttpError } from "./flows.errors.js";
import { buildFlowStartIdempotencyKey } from "./flow-webhook.utils.js";

export const flowTriggerStartBodySchema = z
  .object({
    conversation_id: z.string().optional(),
    customer_phone: z.string().optional(),
    customer_name: z.string().optional(),
    version_id: z.string().optional(),
    idempotency_key: z.string().min(1).optional(),
    initial_variables: z.record(z.unknown()).optional()
  })
  .refine((body) => Boolean(body.conversation_id || body.customer_phone), {
    message: "Se requiere conversation_id o customer_phone"
  });

export type FlowTriggerStartBody = z.infer<typeof flowTriggerStartBodySchema>;

export class FlowTriggerStartService {
  async startByApi(input: {
    tenantId: string;
    flowDefinitionId: string;
    body: FlowTriggerStartBody;
    deliverReplies?: boolean;
  }) {
    const body = flowTriggerStartBodySchema.parse(input.body);
    const flow = await this.getActiveFlowWithTrigger(input.tenantId, input.flowDefinitionId, "API");
    const version = await this.resolvePublishedVersion(
      input.tenantId,
      flow,
      body.version_id
    );
    this.assertTriggerEnabled(version.triggers, "API");

    const conversation = await this.resolveConversation(input.tenantId, body);
    const idempotencyKey = body.idempotency_key
      ? buildFlowStartIdempotencyKey(input.tenantId, "api", body.idempotency_key)
      : undefined;

    const result = await flowEngineService.start({
      tenantId: input.tenantId,
      flowDefinitionId: flow.id,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      startedBy: "TRIGGER_API",
      versionId: version.id,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(body.initial_variables ? { initialVariables: body.initial_variables } : {})
    });

    const sentMessages =
      input.deliverReplies !== false
        ? await flowDeliveryService.deliverBotReplies({
            tenantId: input.tenantId,
            conversationId: conversation.id,
            replies: result.replies
          })
        : [];

    const run = await prisma.flowRun.findUniqueOrThrow({ where: { id: result.runId } });
    return {
      run: serializeFlowRun(run),
      replies: result.replies,
      sent_messages: sentMessages,
      completed: result.completed
    };
  }

  async startByWebhookTrigger(input: {
    triggerId: string;
    body: unknown;
    idempotencyKeyHeader?: string;
    deliverReplies?: boolean;
  }) {
    const trigger = await prisma.flowTrigger.findUnique({
      where: { id: input.triggerId },
      include: {
        flowVersion: {
          include: {
            flowDefinition: true
          }
        }
      }
    });

    if (!trigger || !trigger.isEnabled || trigger.triggerType !== "WEBHOOK") {
      throw new FlowHttpError("Trigger webhook no encontrado", 404, "webhook_trigger_not_found");
    }

    const flow = trigger.flowVersion.flowDefinition;
    if (flow.status !== "ACTIVE" || flow.currentVersionId !== trigger.flowVersionId) {
      throw new FlowHttpError("El trigger no pertenece a la versión publicada actual", 409, "trigger_not_current");
    }

    if (trigger.flowVersion.status !== "PUBLISHED") {
      throw new FlowHttpError("La versión del trigger no está publicada", 409, "version_not_published");
    }

    const body = flowTriggerStartBodySchema.parse(input.body ?? {});
    const conversation = await this.resolveConversation(trigger.tenantId, body);
    const idempotencyKey = (body.idempotency_key ?? input.idempotencyKeyHeader)
      ? buildFlowStartIdempotencyKey(
          trigger.tenantId,
          "webhook",
          body.idempotency_key ?? input.idempotencyKeyHeader!
        )
      : undefined;

    const result = await flowEngineService.start({
      tenantId: trigger.tenantId,
      flowDefinitionId: flow.id,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      startedBy: "TRIGGER_WEBHOOK",
      versionId: trigger.flowVersionId,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(body.initial_variables ? { initialVariables: body.initial_variables } : {})
    });

    const sentMessages =
      input.deliverReplies !== false
        ? await flowDeliveryService.deliverBotReplies({
            tenantId: trigger.tenantId,
            conversationId: conversation.id,
            replies: result.replies
          })
        : [];

    const run = await prisma.flowRun.findUniqueOrThrow({ where: { id: result.runId } });
    return {
      run: serializeFlowRun(run),
      replies: result.replies,
      sent_messages: sentMessages,
      completed: result.completed
    };
  }

  private async getActiveFlowWithTrigger(
    tenantId: string,
    flowDefinitionId: string,
    triggerType: "API" | "WEBHOOK"
  ) {
    const flow = await prisma.flowDefinition.findFirst({
      where: { id: flowDefinitionId, tenantId, status: "ACTIVE", currentVersionId: { not: null } },
      include: {
        currentVersion: {
          include: {
            triggers: {
              where: { isEnabled: true, triggerType }
            }
          }
        }
      }
    });

    if (!flow?.currentVersion) {
      throw new FlowHttpError("Flujo no encontrado o sin versión publicada", 404, "flow_not_found");
    }

    return flow;
  }

  private async resolvePublishedVersion(
    tenantId: string,
    flow: { id: string; currentVersion: { id: string; status: string; triggers: unknown[] } | null },
    versionId?: string
  ) {
    if (versionId) {
      const version = await prisma.flowVersion.findFirst({
        where: {
          id: versionId,
          tenantId,
          flowDefinitionId: flow.id,
          status: "PUBLISHED"
        },
        include: { triggers: true }
      });
      if (!version) {
        throw new FlowHttpError("Versión publicada no encontrada", 404, "version_not_found");
      }
      return version;
    }

    const current = flow.currentVersion;
    if (!current || current.status !== "PUBLISHED") {
      throw new FlowHttpError("No hay versión publicada para ejecutar", 409, "no_published_version");
    }

    return prisma.flowVersion.findUniqueOrThrow({
      where: { id: current.id },
      include: { triggers: true }
    });
  }

  private assertTriggerEnabled(
    triggers: Array<{ triggerType: string; isEnabled: boolean }>,
    triggerType: "API" | "WEBHOOK"
  ) {
    if (!triggers.some((t) => t.triggerType === triggerType && t.isEnabled)) {
      throw new FlowHttpError(`El flujo no tiene trigger ${triggerType} habilitado`, 409, "trigger_not_enabled");
    }
  }

  private async resolveConversation(
    tenantId: string,
    body: FlowTriggerStartBody
  ): Promise<{ id: string; customerId: string }> {
    if (body.conversation_id) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: body.conversation_id, tenantId },
        select: { id: true, customerId: true }
      });
      if (!conversation) {
        throw new FlowHttpError("Conversación no encontrada", 404, "conversation_not_found");
      }
      return conversation;
    }

    const phone = normalizePhone(body.customer_phone!);
    const channel = await prisma.tenantChannel.findFirst({
      where: { tenantId, isActive: true, status: "ACTIVE" }
    });
    if (!channel) {
      throw new FlowHttpError("No hay canal WhatsApp activo para el negocio", 400, "no_active_channel");
    }

    const customer = await prisma.customer.upsert({
      where: { tenantId_phoneNumber: { tenantId, phoneNumber: phone } },
      create: {
        tenantId,
        phoneNumber: phone,
        name: body.customer_name ?? null
      },
      update: {
        ...(body.customer_name !== undefined ? { name: body.customer_name } : {})
      }
    });

    const conversation =
      (await prisma.conversation.findFirst({
        where: {
          tenantId,
          customerId: customer.id,
          status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] }
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, customerId: true }
      })) ??
      (await prisma.conversation.create({
        data: {
          tenantId,
          customerId: customer.id,
          channelPhoneNumber: normalizePhone(channel.phoneNumber),
          status: ConversationStatus.OPEN,
          mode: ConversationMode.BOT
        },
        select: { id: true, customerId: true }
      }));

    return conversation;
  }
}

export const flowTriggerStartService = new FlowTriggerStartService();
