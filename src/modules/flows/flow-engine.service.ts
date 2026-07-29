import { Prisma, type FlowRunStatus } from "@prisma/client";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { handoffService } from "../runtime/handoff.service.js";
import type { IncomingMediaAttachment } from "../../types/whatsapp.js";
import type { FlowDefinitionGraph, FlowFieldDefinition, FlowNode } from "./domain/flow-definition.schema.js";
import { parseFlowDefinitionGraph } from "./domain/flow-definition.schema.js";
import {
  getNode,
  getOutgoingEdges,
  getStartNode,
  interpolateTemplate,
  parseYesNo,
  resolveNextNodeId
} from "./domain/flow-graph.utils.js";
import {
  buildConfirmationSummary,
  buildMissingFieldsPrompt,
  emptyVariablesState,
  extractSimpleFieldsFromText,
  getMissingRequiredFields,
  parseVariablesJson,
  serializeVariablesState,
  upsertSlot,
  type FlowVariablesState
} from "./domain/flow-slots.js";
import { FlowHttpError } from "./flows.errors.js";
import { flowRunLockService } from "./infrastructure/flow-run-lock.service.js";
import {
  applyQuoteFlatUpdates,
  flowQuoteService
} from "./flow-quote.service.js";
import { flowFileService } from "./flow-file.service.js";
import { flowWebhookDeliveryService } from "./flow-webhook-delivery.service.js";

const TERMINAL_STATUSES = new Set<FlowRunStatus>(["COMPLETED", "CANCELLED", "FAILED"]);

export interface FlowEngineReply {
  text: string;
  aiGenerated?: boolean;
}

export interface FlowEngineResult {
  runId: string;
  status: FlowRunStatus;
  replies: FlowEngineReply[];
  completed: boolean;
  handoff?: boolean;
}

export interface ProcessFlowEventInput {
  runId: string;
  tenantId: string;
  incomingText?: string;
  sourceMessageId?: string;
  incomingMedia?: IncomingMediaAttachment;
  accessToken?: string;
  idempotencyKey?: string;
  agentInput?: Record<string, unknown>;
  reviewResolution?: {
    reviewId: string;
    status: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    notes?: string;
  };
  handoffContext?: {
    tenantName: string;
    customerPhone: string;
    customerName?: string | null;
    channelPhoneNumberId: string;
    accessToken: string;
    handoffMessage?: string;
  };
}

interface RunContext {
  runId: string;
  tenantId: string;
  conversationId: string;
  customerId: string;
  flowDefinitionId: string;
  flowVersionNumber: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  graph: FlowDefinitionGraph;
  variables: FlowVariablesState;
  currentNodeId: string;
  status: FlowRunStatus;
  lockVersion: number;
  replies: FlowEngineReply[];
}

export class FlowEngineService {
  async start(input: {
    tenantId: string;
    flowDefinitionId: string;
    conversationId: string;
    customerId: string;
    startedBy: "MANUAL" | "TRIGGER_KEYWORD" | "TRIGGER_INTENT" | "TRIGGER_WEBHOOK" | "TRIGGER_API" | "SYSTEM";
    startedByAdminId?: string;
    versionId?: string;
    idempotencyKey?: string;
    initialVariables?: Record<string, unknown>;
  }): Promise<FlowEngineResult> {
    if (input.idempotencyKey) {
      const existing = await prisma.flowRunEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (existing) {
        const run = await prisma.flowRun.findUniqueOrThrow({ where: { id: existing.flowRunId } });
        return {
          runId: run.id,
          status: run.status,
          replies: [],
          completed: TERMINAL_STATUSES.has(run.status)
        };
      }
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId: input.tenantId }
    });
    if (!conversation) {
      throw new FlowHttpError("Conversación no encontrada", 404);
    }
    if (conversation.activeFlowRunId) {
      throw new FlowHttpError("Ya hay un flujo activo en esta conversación", 409, "active_flow_exists");
    }

    const flow = await prisma.flowDefinition.findFirst({
      where: { id: input.flowDefinitionId, tenantId: input.tenantId, status: { in: ["ACTIVE", "DRAFT"] } },
      include: { currentVersion: true }
    });
    if (!flow) {
      throw new FlowHttpError("Flujo no encontrado", 404);
    }

    const version =
      (input.versionId
        ? await prisma.flowVersion.findFirst({
            where: {
              id: input.versionId,
              tenantId: input.tenantId,
              flowDefinitionId: flow.id,
              status: "PUBLISHED"
            }
          })
        : null) ?? flow.currentVersion;

    if (!version || version.status !== "PUBLISHED") {
      throw new FlowHttpError("No hay versión publicada para ejecutar", 409, "no_published_version");
    }

    const graph = parseFlowDefinitionGraph(version.graphJson);
    const startNode = getStartNode(graph);

    let variables = emptyVariablesState();
    if (input.initialVariables) {
      for (const [key, value] of Object.entries(input.initialVariables)) {
        variables = upsertSlot(variables, key, value, {
          sourceType: "integration",
          status: "confirmed"
        });
      }
    }

    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.flowRun.create({
        data: {
          tenantId: input.tenantId,
          flowVersionId: version.id,
          conversationId: input.conversationId,
          customerId: input.customerId,
          currentNodeId: startNode.id,
          status: "RUNNING",
          variablesJson: serializeVariablesState(variables) as Prisma.InputJsonValue,
          startedBy: input.startedBy,
          startedByAdminId: input.startedByAdminId ?? null
        }
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { activeFlowRunId: created.id, mode: "BOT" }
      });

      await tx.flowRunEvent.create({
        data: {
          tenantId: input.tenantId,
          flowRunId: created.id,
          nodeId: startNode.id,
          eventType: "flow.started",
          idempotencyKey: input.idempotencyKey ?? null,
          payloadJson: { flowDefinitionId: flow.id, versionId: version.id }
        }
      });

      return created;
    });

    return this.processEvent({
      runId: run.id,
      tenantId: input.tenantId
    });
  }

  async processEvent(input: ProcessFlowEventInput): Promise<FlowEngineResult> {
    return flowRunLockService.withLock(input.runId, async () => {
      if (input.idempotencyKey) {
        const existing = await prisma.flowRunEvent.findUnique({
          where: { idempotencyKey: input.idempotencyKey }
        });
        if (existing) {
          const run = await prisma.flowRun.findUniqueOrThrow({ where: { id: input.runId } });
          return {
            runId: run.id,
            status: run.status,
            replies: [],
            completed: TERMINAL_STATUSES.has(run.status)
          };
        }
      }

      const run = await prisma.flowRun.findFirst({
        where: { id: input.runId, tenantId: input.tenantId },
        include: {
          flowVersion: { include: { flowDefinition: { select: { id: true } } } },
          customer: { select: { name: true, phoneNumber: true, email: true } }
        }
      });

      if (!run) {
        throw new FlowHttpError("Ejecución no encontrada", 404);
      }

      if (TERMINAL_STATUSES.has(run.status)) {
        return {
          runId: run.id,
          status: run.status,
          replies: [],
          completed: true
        };
      }

      const graph = parseFlowDefinitionGraph(run.flowVersion.graphJson);
      const ctx: RunContext = {
        runId: run.id,
        tenantId: run.tenantId,
        conversationId: run.conversationId,
        customerId: run.customerId,
        flowDefinitionId: run.flowVersion.flowDefinition.id,
        flowVersionNumber: run.flowVersion.versionNumber,
        customerName: run.customer.name,
        customerPhone: run.customer.phoneNumber,
        customerEmail: run.customer.email,
        graph,
        variables: parseVariablesJson(run.variablesJson),
        currentNodeId: run.currentNodeId ?? getStartNode(graph).id,
        status: run.status,
        lockVersion: run.lockVersion,
        replies: []
      };

      if (input.reviewResolution) {
        await this.applyReviewResolution(ctx, input.reviewResolution);
      } else if (input.agentInput) {
        await this.applyAgentInput(ctx, input.agentInput);
      } else if (input.incomingMedia && input.accessToken) {
        await this.applyCustomerMedia(
          ctx,
          input.incomingMedia,
          input.accessToken,
          input.sourceMessageId
        );
      } else if (input.incomingText) {
        await this.applyCustomerInput(ctx, input.incomingText, input.sourceMessageId);
      }

      await this.advanceUntilWait(ctx, input.handoffContext);

      await this.persistRun(ctx);

      if (input.idempotencyKey) {
        await prisma.flowRunEvent.create({
          data: {
            tenantId: input.tenantId,
            flowRunId: input.runId,
            nodeId: ctx.currentNodeId,
            eventType: "flow.event.processed",
            platformMessageId: input.sourceMessageId ?? null,
            idempotencyKey: input.idempotencyKey,
            payloadJson: {
              status: ctx.status,
              replies: ctx.replies.map((r) => r.text)
            }
          }
        });
      }

      return {
        runId: ctx.runId,
        status: ctx.status,
        replies: ctx.replies,
        completed: TERMINAL_STATUSES.has(ctx.status),
        handoff: ctx.status === "CANCELLED" && ctx.replies.some((r) => r.text.includes("asesor"))
      };
    });
  }

  private async applyReviewResolution(
    ctx: RunContext,
    resolution: NonNullable<ProcessFlowEventInput["reviewResolution"]>
  ) {
    const review = await prisma.flowReview.findFirst({
      where: { id: resolution.reviewId, flowRunId: ctx.runId, tenantId: ctx.tenantId }
    });
    if (!review) {
      throw new FlowHttpError("Revisión no encontrada", 404);
    }

    await prisma.flowReview.update({
      where: { id: review.id },
      data: {
        status: resolution.status,
        resolution: resolution.status,
        notes: resolution.notes ?? null,
        resolvedAt: new Date()
      }
    });

    ctx.variables = upsertSlot(ctx.variables, "review.status", resolution.status, {
      sourceType: "human",
      status: "confirmed"
    });

    if (resolution.status === "APPROVED") {
      ctx.status = "RUNNING";
      const node = getNode(ctx.graph, review.nodeId);
      const approvedNext = node?.config.approvedNextNodeId;
      if (typeof approvedNext === "string") {
        ctx.currentNodeId = approvedNext;
      }
    } else {
      const node = getNode(ctx.graph, review.nodeId);
      const maxAttempts =
        typeof node?.config.maxAttempts === "number" ? node.config.maxAttempts : 3;
      const nextAttempt = review.attempt + 1;

      await prisma.flowReview.update({
        where: { id: review.id },
        data: { attempt: nextAttempt }
      });

      if (nextAttempt >= maxAttempts && typeof node?.config.onMaxAttemptsNodeId === "string") {
        ctx.currentNodeId = node.config.onMaxAttemptsNodeId;
        ctx.replies.push({
          text: "No pudimos validar el archivo después de varios intentos. Te derivamos con un asesor."
        });
      } else {
        const rejectedNext = node?.config.rejectedNextNodeId;
        if (typeof rejectedNext === "string") {
          ctx.currentNodeId = rejectedNext;
        }
        ctx.replies.push({
          text:
            resolution.status === "CHANGES_REQUESTED"
              ? "Gracias. Envíanos un archivo actualizado según las indicaciones del asesor."
              : "Necesitamos que envíes un nuevo archivo para continuar."
        });
      }

      ctx.status = "RUNNING";
      ctx.variables = upsertSlot(ctx.variables, "review.status", resolution.status, {
        sourceType: "human",
        status: "rejected"
      });
    }
  }

  private async applyCustomerMedia(
    ctx: RunContext,
    media: IncomingMediaAttachment,
    accessToken: string,
    sourceMessageId?: string
  ) {
    if (ctx.status === "AWAITING_AGENT_INPUT" || ctx.status === "AWAITING_REVIEW") {
      return;
    }

    const node = getNode(ctx.graph, ctx.currentNodeId);
    const targetField = this.resolvePendingFileField(ctx, node);
    if (!targetField) {
      ctx.replies.push({
        text: "Recibimos tu archivo, pero en este paso aún no lo necesitamos. Continúa con la información solicitada."
      });
      return;
    }

    const flowFile = await flowFileService.ingestWhatsAppMedia({
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      customerId: ctx.customerId,
      flowRunId: ctx.runId,
      messageExternalId: sourceMessageId ?? media.mediaId,
      media,
      accessToken
    });

    ctx.variables = upsertSlot(
      ctx.variables,
      targetField,
      {
        flowFileId: flowFile.id,
        filename: flowFile.originalFilename,
        mimeType: flowFile.mimeType
      },
      {
        ...(sourceMessageId ? { sourceMessageId } : {}),
        sourceType: "current_message",
        status: "captured"
      }
    );

    ctx.status = "RUNNING";
    const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
    if (next) {
      ctx.currentNodeId = next;
    }

    ctx.replies.push({ text: "Archivo recibido correctamente. Continuamos con tu solicitud." });
  }

  private resolvePendingFileField(ctx: RunContext, node?: FlowNode): string | null {
    if (node?.type === "collect_fields") {
      const fieldKeys = this.resolveCollectFieldKeys(ctx.graph, node);
      const fileField = ctx.graph.fields.find(
        (field) => fieldKeys.includes(field.key) && field.type === "file"
      );
      if (fileField) {
        const slot = ctx.variables.slots[fileField.key];
        const flat = ctx.variables.flat[fileField.key];
        if (!slot?.value && !flat) {
          return fileField.key;
        }
      }
    }

    const missingFile = ctx.graph.fields.find((field) => {
      if (field.type !== "file") {
        return false;
      }
      const slot = ctx.variables.slots[field.key];
      return !slot?.value;
    });

    return missingFile?.key ?? null;
  }

  private async applyAgentInput(ctx: RunContext, values: Record<string, unknown>) {
    if (ctx.status !== "AWAITING_AGENT_INPUT") {
      throw new FlowHttpError("El flujo no está esperando input de agente", 409);
    }

    const node = getNode(ctx.graph, ctx.currentNodeId);
    if (!node || node.type !== "message") {
      throw new FlowHttpError("Nodo actual inválido para agent input", 409);
    }

    for (const [key, value] of Object.entries(values)) {
      ctx.variables = upsertSlot(ctx.variables, key, value, {
        sourceType: "human",
        status: "confirmed"
      });
    }

    const template = typeof node.config.template === "string" ? node.config.template : "";
    const text = interpolateTemplate(template, ctx.variables.flat);
    if (text.trim()) {
      ctx.replies.push({ text: text.trim() });
    }

    ctx.status = "RUNNING";
    const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
    if (next) {
      ctx.currentNodeId = next;
    }
  }

  private async applyCustomerInput(
    ctx: RunContext,
    text: string,
    sourceMessageId?: string
  ) {
    if (ctx.status === "AWAITING_AGENT_INPUT" || ctx.status === "AWAITING_REVIEW") {
      return;
    }

    const node = getNode(ctx.graph, ctx.currentNodeId);
    if (!node) {
      return;
    }

    if (node.type === "collect_fields" || node.type === "start") {
      const fieldKeys = this.resolveCollectFieldKeys(ctx.graph, node);
      const fields = ctx.graph.fields.filter((f) => fieldKeys.includes(f.key));
      const extracted = extractSimpleFieldsFromText(text, fields);
      for (const item of extracted) {
        ctx.variables = upsertSlot(ctx.variables, item.key, item.value, {
          ...(sourceMessageId ? { sourceMessageId } : {}),
          sourceType: "current_message"
        });
      }

      const missing = getMissingRequiredFields(fields, ctx.variables);
      if (missing.length === 0) {
        ctx.status = "RUNNING";
        const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
        if (next) {
          ctx.currentNodeId = next;
        }
      } else {
        ctx.status = "AWAITING_CUSTOMER";
        ctx.replies.push({ text: buildMissingFieldsPrompt(missing), aiGenerated: true });
      }
      return;
    }

    if (node.type === "choice") {
      const fieldKey = typeof node.config.field === "string" ? node.config.field : "choice";
      const options = Array.isArray(node.config.options)
        ? (node.config.options as Array<{ value?: string; label?: string }>)
        : [];
      const trimmed = text.trim().toLowerCase();
      let selected: string | null = null;

      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= options.length) {
        selected = options[numeric - 1]?.value ?? options[numeric - 1]?.label ?? null;
      }

      for (const option of options) {
        const label = (option.label ?? option.value ?? "").toLowerCase();
        const value = (option.value ?? option.label ?? "").toLowerCase();
        if (trimmed === label || trimmed === value || trimmed.includes(label) || trimmed.includes(value)) {
          selected = option.value ?? option.label ?? null;
          break;
        }
      }

      if (!selected) {
        ctx.status = "AWAITING_CUSTOMER";
        ctx.replies.push({ text: "No entendí tu elección. Responde con el número o el nombre de la opción." });
        return;
      }

      ctx.variables = upsertSlot(ctx.variables, fieldKey, selected, {
        ...(sourceMessageId ? { sourceMessageId } : {})
      });
      ctx.status = "RUNNING";
      const edges = getOutgoingEdges(ctx.graph, ctx.currentNodeId);
      const matched = edges.find((edge) =>
        edge.condition ? edge.condition.value === selected : true
      );
      ctx.currentNodeId = matched?.target ?? resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat) ?? ctx.currentNodeId;
      return;
    }

    if (node.type === "confirmation") {
      const answer = parseYesNo(text);
      if (!answer) {
        ctx.status = "AWAITING_CUSTOMER";
        ctx.replies.push({ text: "Por favor responde sí o no para confirmar." });
        return;
      }

      if (answer === "no") {
        ctx.status = "AWAITING_CUSTOMER";
        ctx.replies.push({
          text: "Entendido. Indícame qué dato quieres corregir y lo actualizamos."
        });
        return;
      }

      ctx.status = "RUNNING";
      const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
      if (next) {
        ctx.currentNodeId = next;
      }
    }
  }

  private resolveCollectFieldKeys(graph: FlowDefinitionGraph, node: FlowNode): string[] {
    if (Array.isArray(node.config.fields)) {
      return node.config.fields.filter((f): f is string => typeof f === "string");
    }
    return graph.fields.map((f) => f.key);
  }

  private async advanceUntilWait(
    ctx: RunContext,
    handoffContext?: ProcessFlowEventInput["handoffContext"]
  ) {
    let guard = 0;
    while (guard < 30 && !TERMINAL_STATUSES.has(ctx.status) && ctx.status !== "AWAITING_CUSTOMER") {
      guard += 1;
      const node = getNode(ctx.graph, ctx.currentNodeId);
      if (!node) {
        ctx.status = "FAILED";
        break;
      }

      if (node.type === "start") {
        const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
        if (!next) {
          ctx.status = "COMPLETED";
          break;
        }
        ctx.currentNodeId = next;
        continue;
      }

      if (node.type === "collect_fields") {
        const fieldKeys = this.resolveCollectFieldKeys(ctx.graph, node);
        const fields = ctx.graph.fields.filter((f) => fieldKeys.includes(f.key));
        const missing = getMissingRequiredFields(fields, ctx.variables);
        if (missing.length > 0) {
          ctx.status = "AWAITING_CUSTOMER";
          const prompt =
            typeof node.config.prompt === "string"
              ? node.config.prompt
              : buildMissingFieldsPrompt(missing);
          if (!ctx.replies.some((reply) => reply.text === prompt)) {
            ctx.replies.push({ text: prompt, aiGenerated: true });
          }
          break;
        }
        const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
        if (!next) {
          ctx.status = "COMPLETED";
          break;
        }
        ctx.currentNodeId = next;
        continue;
      }

      if (node.type === "message") {
        const requiredFields = Array.isArray(node.config.requiredFields)
          ? (node.config.requiredFields as Array<{ key: string; label?: string; type?: string }>)
          : [];
        const missingAgentFields = requiredFields.filter((field) => {
          const value = ctx.variables.flat[field.key] ?? ctx.variables.slots[field.key]?.value;
          return value === undefined || value === null || value === "";
        });

        if (node.config.sender === "agent" && missingAgentFields.length > 0) {
          ctx.status = "AWAITING_AGENT_INPUT";
          await prisma.flowRun.update({
            where: { id: ctx.runId },
            data: {
              pendingAgentInputJson: {
                template:
                  typeof node.config.template === "string"
                    ? node.config.template
                    : typeof node.config.text === "string"
                      ? node.config.text
                      : "",
                fields: missingAgentFields,
                prefilled: ctx.variables.flat
              } as Prisma.InputJsonValue
            }
          });
          break;
        }

        const template =
          typeof node.config.template === "string"
            ? node.config.template
            : typeof node.config.text === "string"
              ? node.config.text
              : "";
        if (template.trim()) {
          ctx.replies.push({
            text: interpolateTemplate(template, ctx.variables.flat).trim(),
            aiGenerated: false
          });
        }

        const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
        if (!next) {
          ctx.status = "COMPLETED";
          break;
        }
        ctx.currentNodeId = next;
        continue;
      }

      if (node.type === "choice" || node.type === "confirmation") {
        if (ctx.status === "RUNNING") {
          if (node.type === "choice") {
            const options = Array.isArray(node.config.options)
              ? (node.config.options as Array<{ label?: string; value?: string }>)
              : [];
            const lines = options.map((o, i) => `${i + 1}. ${o.label ?? o.value ?? "Opción"}`);
            ctx.replies.push({
              text: ["Elige una opción:", ...lines].join("\n")
            });
          } else {
            ctx.replies.push({
              text: buildConfirmationSummary(ctx.graph.fields, ctx.variables),
              aiGenerated: true
            });
          }
          ctx.status = "AWAITING_CUSTOMER";
        }
        break;
      }

      if (node.type === "review") {
        const subjectField =
          typeof node.config.subjectField === "string" ? node.config.subjectField : "engraving.logoFile";
        const subjectValue = ctx.variables.slots[subjectField]?.value ?? ctx.variables.flat[subjectField];
        const subjectRef =
          typeof subjectValue === "object" && subjectValue && "flowFileId" in (subjectValue as object)
            ? String((subjectValue as { flowFileId: string }).flowFileId)
            : String(subjectValue ?? subjectField);

        await prisma.flowReview.create({
          data: {
            tenantId: ctx.tenantId,
            flowRunId: ctx.runId,
            nodeId: node.id,
            subjectType: "file",
            subjectReference: subjectRef,
            status: "PENDING"
          }
        });

        ctx.status = "AWAITING_REVIEW";
        ctx.replies.push({
          text: "Recibimos tu archivo. Un asesor lo revisará y te avisaremos en breve."
        });
        break;
      }

      if (node.type === "action") {
        if (node.config.action === "calculate_quote") {
          const quote = await flowQuoteService.calculateQuote({
            tenantId: ctx.tenantId,
            customerId: ctx.customerId,
            variables: ctx.variables.flat,
            config: {
              useCatalog: node.config.useCatalog !== false,
              useDelivery: node.config.useDelivery !== false,
              ...(typeof node.config.logoAdaptationPrice === "number"
                ? { logoAdaptationPrice: node.config.logoAdaptationPrice }
                : {}),
              ...(typeof node.config.fallbackUnitPrice === "number"
                ? { fallbackUnitPrice: node.config.fallbackUnitPrice }
                : {})
            }
          });

          ctx.variables = applyQuoteFlatUpdates(ctx.variables, quote.flatUpdates);

          if (!ctx.replies.some((reply) => reply.text.includes(String(quote.pricing.total)))) {
            ctx.replies.push({
              text: `Cotización preliminar: ${quote.pricing.total.toLocaleString("es-CL")} ${quote.pricing.currency} (${quote.product.name}, ${quote.items[0]?.quantity ?? 1} un.).`,
              aiGenerated: false
            });
          }
        }

        const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
        if (!next) {
          ctx.status = "COMPLETED";
          break;
        }
        ctx.currentNodeId = next;
        continue;
      }

      if (node.type === "emit_event") {
        const eventType =
          typeof node.config.eventType === "string" ? node.config.eventType : "flow.output";

        let payload: Record<string, unknown> = {
          variables: ctx.variables.flat,
          eventType
        };

        if (eventType === "quote.confirmed") {
          const quote =
            flowQuoteService.buildQuoteResultFromVariables(ctx.variables.flat) ??
            (await flowQuoteService.calculateQuote({
              tenantId: ctx.tenantId,
              customerId: ctx.customerId,
              variables: ctx.variables.flat
            }));

          payload = flowQuoteService.buildQuoteConfirmedPayload({
            tenantId: ctx.tenantId,
            conversationId: ctx.conversationId,
            customerId: ctx.customerId,
            flowDefinitionId: ctx.flowDefinitionId,
            flowVersion: ctx.flowVersionNumber,
            runId: ctx.runId,
            quote,
            customer: {
              name: ctx.customerName ?? null,
              phone: ctx.customerPhone ?? null,
              email: ctx.customerEmail ?? null
            },
            confirmed: true
          });
        }

        const runEvent = await prisma.flowRunEvent.create({
          data: {
            tenantId: ctx.tenantId,
            flowRunId: ctx.runId,
            nodeId: node.id,
            eventType,
            payloadJson: payload as Prisma.InputJsonValue
          }
        });

        try {
          await flowWebhookDeliveryService.scheduleFromFlowEvent({
            tenantId: ctx.tenantId,
            flowRunId: ctx.runId,
            flowRunEventId: runEvent.id,
            nodeId: node.id,
            eventType,
            payload,
            nodeConfig: node.config
          });
        } catch (error) {
          logger.error(
            { err: error, runId: ctx.runId, eventType },
            "No se pudo encolar webhook saliente de flujo"
          );
        }

        const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
        if (!next) {
          ctx.status = "COMPLETED";
          break;
        }
        ctx.currentNodeId = next;
        continue;
      }

      if (node.type === "handoff") {
        if (handoffContext) {
          const handoff = await handoffService.execute({
            tenantId: ctx.tenantId,
            tenantName: handoffContext.tenantName,
            conversationId: ctx.conversationId,
            customerPhone: handoffContext.customerPhone,
            customerName: handoffContext.customerName ?? null,
            messageText: "Flujo derivado a humano",
            handoffReason: "special_quote",
            ...(handoffContext.handoffMessage
              ? { handoffMessage: handoffContext.handoffMessage }
              : {}),
            channelPhoneNumberId: handoffContext.channelPhoneNumberId,
            accessToken: handoffContext.accessToken
          });
          ctx.replies.push({ text: handoff.reply });
        }
        ctx.status = "CANCELLED";
        break;
      }

      if (node.type === "end") {
        ctx.status = "COMPLETED";
        break;
      }

      const next = resolveNextNodeId(ctx.graph, ctx.currentNodeId, ctx.variables.flat);
      if (!next) {
        ctx.status = "COMPLETED";
        break;
      }
      ctx.currentNodeId = next;
    }

    if (TERMINAL_STATUSES.has(ctx.status)) {
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { activeFlowRunId: null }
      });
    }
  }

  private async persistRun(ctx: RunContext) {
    const data: Prisma.FlowRunUpdateInput = {
      currentNodeId: ctx.currentNodeId,
      status: ctx.status,
      variablesJson: serializeVariablesState(ctx.variables) as Prisma.InputJsonValue,
      lockVersion: { increment: 1 },
      completedAt: TERMINAL_STATUSES.has(ctx.status) ? new Date() : null
    };

    if (ctx.status !== "AWAITING_AGENT_INPUT") {
      data.pendingAgentInputJson = Prisma.JsonNull;
    }

    await prisma.flowRun.update({
      where: { id: ctx.runId, lockVersion: ctx.lockVersion },
      data
    });
  }

  async pause(runId: string, tenantId: string) {
    await prisma.flowRun.updateMany({
      where: { id: runId, tenantId, status: { notIn: [...TERMINAL_STATUSES] } },
      data: { status: "PAUSED" }
    });
  }

  async resume(runId: string, tenantId: string) {
    await prisma.flowRun.updateMany({
      where: { id: runId, tenantId, status: "PAUSED" },
      data: { status: "RUNNING" }
    });
    return this.processEvent({ runId, tenantId });
  }

  async cancel(runId: string, tenantId: string) {
    const run = await prisma.flowRun.updateMany({
      where: { id: runId, tenantId, status: { notIn: [...TERMINAL_STATUSES] } },
      data: { status: "CANCELLED", completedAt: new Date() }
    });
    if (run.count > 0) {
      const current = await prisma.flowRun.findUnique({ where: { id: runId } });
      if (current) {
        await prisma.conversation.update({
          where: { id: current.conversationId },
          data: { activeFlowRunId: null }
        });
      }
    }
  }
}

export const flowEngineService = new FlowEngineService();

export function isTerminalFlowStatus(status: FlowRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function getCollectFieldsForNode(
  graph: FlowDefinitionGraph,
  node: FlowNode
): FlowFieldDefinition[] {
  if (Array.isArray(node.config.fields)) {
    const keys = node.config.fields.filter((f): f is string => typeof f === "string");
    return graph.fields.filter((f) => keys.includes(f.key));
  }
  return graph.fields;
}
