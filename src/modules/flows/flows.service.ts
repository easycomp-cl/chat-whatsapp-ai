import type { FlowTriggerType, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { createDefaultFlowGraph, createWoodQuoteFlowGraph } from "./domain/flow-defaults.js";
import {
  flowDefinitionGraphSchema,
  flowTriggerInputSchema,
  parseFlowDefinitionGraph,
  type FlowDefinitionGraph,
  type FlowTriggerInput
} from "./domain/flow-definition.schema.js";
import { assertFlowAdmin } from "./flows-admin.js";
import { FlowHttpError } from "./flows.errors.js";
import {
  attachEncryptedWebhookSecret,
  hashWebhookSecret
} from "./flow-webhook.utils.js";

function mapTriggerType(type: FlowTriggerInput["trigger_type"]): FlowTriggerType {
  return type;
}

function triggersFromGraph(graph: FlowDefinitionGraph): FlowTriggerInput[] {
  const typeMap: Record<string, FlowTriggerInput["trigger_type"]> = {
    manual: "MANUAL",
    ai_intent: "AI_INTENT",
    keyword: "KEYWORD",
    webhook: "WEBHOOK",
    api: "API"
  };

  return [
    {
      trigger_type: typeMap[graph.trigger.type] ?? "MANUAL",
      channel: graph.trigger.channel?.toUpperCase() === "WHATSAPP" ? "WHATSAPP" : undefined,
      priority: graph.trigger.priority ?? 100,
      configuration_json: {
        intent: graph.trigger.intent,
        keywords: graph.trigger.keywords
      },
      is_enabled: true
    }
  ];
}

async function syncVersionTriggers(
  tx: Prisma.TransactionClient,
  tenantId: string,
  flowVersionId: string,
  triggers: FlowTriggerInput[]
) {
  await tx.flowTrigger.deleteMany({ where: { flowVersionId, tenantId } });

  for (const trigger of triggers) {
    const parsed = flowTriggerInputSchema.parse(trigger);
    let webhookSecretHash: string | undefined;
    let webhookSecretPlain: string | undefined;

    if (parsed.trigger_type === "WEBHOOK") {
      webhookSecretPlain = randomBytes(24).toString("hex");
      webhookSecretHash = hashWebhookSecret(webhookSecretPlain);
      parsed.configuration_json = attachEncryptedWebhookSecret(
        parsed.configuration_json,
        webhookSecretPlain
      );
    }

    await tx.flowTrigger.create({
      data: {
        tenantId,
        flowVersionId,
        triggerType: mapTriggerType(parsed.trigger_type),
        channel: parsed.channel ?? null,
        priority: parsed.priority,
        configurationJson: parsed.configuration_json as Prisma.InputJsonValue,
        webhookSecretHash: webhookSecretHash ?? null,
        isEnabled: parsed.is_enabled
      }
    });

    if (webhookSecretPlain) {
      // Devuelto una sola vez vía publish response; no se almacena en claro.
      (parsed as FlowTriggerInput & { _webhook_secret?: string })._webhook_secret = webhookSecretPlain;
    }
  }
}

export class FlowsService {
  async listFlows(tenantId: string, query?: { status?: string }) {
    const flows = await prisma.flowDefinition.findMany({
      where: {
        tenantId,
        ...(query?.status ? { status: query.status as never } : {})
      },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        currentVersion: {
          include: { triggers: true }
        },
        _count: { select: { versions: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
    return flows;
  }

  async createFlow(
    tenantId: string,
    input: {
      name: string;
      description?: string;
      createdByAdminId: string;
      template?: "default" | "wood_quote";
    }
  ) {
    await assertFlowAdmin(tenantId, input.createdByAdminId);

    const graph =
      input.template === "wood_quote"
        ? createWoodQuoteFlowGraph(input.name)
        : createDefaultFlowGraph(input.name);

    parseFlowDefinitionGraph(graph);

    return prisma.$transaction(async (tx) => {
      const flow = await tx.flowDefinition.create({
        data: {
          tenantId,
          name: input.name,
          description: input.description ?? null,
          createdByAdminId: input.createdByAdminId,
          updatedByAdminId: input.createdByAdminId
        }
      });

      const version = await tx.flowVersion.create({
        data: {
          tenantId,
          flowDefinitionId: flow.id,
          versionNumber: 1,
          graphJson: graph as Prisma.InputJsonValue,
          createdByAdminId: input.createdByAdminId
        }
      });

      await syncVersionTriggers(tx, tenantId, version.id, triggersFromGraph(graph));

      return tx.flowDefinition.findUniqueOrThrow({
        where: { id: flow.id },
        include: {
          createdByAdmin: { select: { id: true, name: true } },
          currentVersion: { include: { triggers: true } },
          versions: { orderBy: { versionNumber: "desc" }, include: { triggers: true } }
        }
      });
    });
  }

  async getFlow(tenantId: string, flowId: string) {
    const flow = await prisma.flowDefinition.findFirst({
      where: { id: flowId, tenantId },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        updatedByAdmin: { select: { id: true, name: true } },
        currentVersion: { include: { triggers: true } },
        _count: { select: { versions: true } }
      }
    });

    if (!flow) {
      throw new FlowHttpError("Flujo no encontrado", 404, "flow_not_found");
    }

    return flow;
  }

  async patchFlow(
    tenantId: string,
    flowId: string,
    input: {
      name?: string;
      description?: string | null;
      status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
      updatedByAdminId: string;
    }
  ) {
    await assertFlowAdmin(tenantId, input.updatedByAdminId);
    await this.getFlow(tenantId, flowId);

    return prisma.flowDefinition.update({
      where: { id: flowId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedByAdminId: input.updatedByAdminId
      },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        updatedByAdmin: { select: { id: true, name: true } },
        currentVersion: { include: { triggers: true } },
        _count: { select: { versions: true } }
      }
    });
  }

  async deleteFlow(tenantId: string, flowId: string, adminId: string) {
    await assertFlowAdmin(tenantId, adminId);
    const flow = await this.getFlow(tenantId, flowId);

    const runCount = await prisma.flowRun.count({
      where: { tenantId, flowVersion: { flowDefinitionId: flowId } }
    });

    if (runCount > 0 || flow.status !== "DRAFT") {
      return prisma.flowDefinition.update({
        where: { id: flowId },
        data: { status: "ARCHIVED", updatedByAdminId: adminId },
        include: {
          createdByAdmin: { select: { id: true, name: true } },
          updatedByAdmin: { select: { id: true, name: true } },
          currentVersion: { include: { triggers: true } },
          _count: { select: { versions: true } }
        }
      });
    }

    await prisma.flowDefinition.delete({ where: { id: flowId } });
    return null;
  }

  async listVersions(tenantId: string, flowId: string) {
    await this.getFlow(tenantId, flowId);
    return prisma.flowVersion.findMany({
      where: { tenantId, flowDefinitionId: flowId },
      include: {
        triggers: true,
        createdByAdmin: { select: { id: true, name: true } }
      },
      orderBy: { versionNumber: "desc" }
    });
  }

  async getVersion(tenantId: string, flowId: string, versionId: string) {
    const version = await prisma.flowVersion.findFirst({
      where: { id: versionId, tenantId, flowDefinitionId: flowId },
      include: {
        triggers: true,
        createdByAdmin: { select: { id: true, name: true } }
      }
    });

    if (!version) {
      throw new FlowHttpError("Versión no encontrada", 404, "version_not_found");
    }

    return version;
  }

  async createVersion(
    tenantId: string,
    flowId: string,
    input: {
      createdByAdminId: string;
      graphJson?: unknown;
      sourceVersionId?: string;
      triggers?: FlowTriggerInput[];
    }
  ) {
    await assertFlowAdmin(tenantId, input.createdByAdminId);
    await this.getFlow(tenantId, flowId);

    const latest = await prisma.flowVersion.findFirst({
      where: { tenantId, flowDefinitionId: flowId },
      orderBy: { versionNumber: "desc" }
    });

    let graph: FlowDefinitionGraph;
    let triggers: FlowTriggerInput[];

    if (input.graphJson) {
      graph = parseFlowDefinitionGraph(input.graphJson);
      triggers = input.triggers ?? triggersFromGraph(graph);
    } else if (input.sourceVersionId) {
      const source = await this.getVersion(tenantId, flowId, input.sourceVersionId);
      graph = parseFlowDefinitionGraph(source.graphJson);
      graph.version = (latest?.versionNumber ?? 0) + 1;
      triggers =
        input.triggers ??
        source.triggers.map((t) => ({
          trigger_type: t.triggerType,
          channel: t.channel ?? undefined,
          priority: t.priority,
          configuration_json: t.configurationJson as Record<string, unknown>,
          is_enabled: t.isEnabled
        }));
    } else if (latest) {
      graph = parseFlowDefinitionGraph(latest.graphJson);
      graph.version = latest.versionNumber + 1;
      const latestTriggers = await prisma.flowTrigger.findMany({ where: { flowVersionId: latest.id } });
      triggers =
        input.triggers ??
        latestTriggers.map((t) => ({
          trigger_type: t.triggerType,
          channel: t.channel ?? undefined,
          priority: t.priority,
          configuration_json: t.configurationJson as Record<string, unknown>,
          is_enabled: t.isEnabled
        }));
    } else {
      throw new FlowHttpError("No hay versión base para clonar", 400, "no_base_version");
    }

    const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

    return prisma.$transaction(async (tx) => {
      const version = await tx.flowVersion.create({
        data: {
          tenantId,
          flowDefinitionId: flowId,
          versionNumber: nextVersionNumber,
          graphJson: graph as Prisma.InputJsonValue,
          createdByAdminId: input.createdByAdminId
        }
      });

      await syncVersionTriggers(tx, tenantId, version.id, triggers);

      return tx.flowVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: {
          triggers: true,
          createdByAdmin: { select: { id: true, name: true } }
        }
      });
    });
  }

  async updateVersionDraft(
    tenantId: string,
    flowId: string,
    versionId: string,
    input: {
      graphJson: unknown;
      updatedByAdminId: string;
      triggers?: FlowTriggerInput[];
    }
  ) {
    await assertFlowAdmin(tenantId, input.updatedByAdminId);
    const version = await this.getVersion(tenantId, flowId, versionId);

    if (version.status !== "DRAFT") {
      throw new FlowHttpError("Solo se pueden editar versiones en borrador", 409, "version_not_draft");
    }

    const graph = parseFlowDefinitionGraph(input.graphJson);
    const triggers = input.triggers ?? triggersFromGraph(graph);

    return prisma.$transaction(async (tx) => {
      await tx.flowVersion.update({
        where: { id: versionId },
        data: { graphJson: graph as Prisma.InputJsonValue }
      });

      await syncVersionTriggers(tx, tenantId, versionId, triggers);

      await tx.flowDefinition.update({
        where: { id: flowId },
        data: { updatedByAdminId: input.updatedByAdminId }
      });

      return tx.flowVersion.findUniqueOrThrow({
        where: { id: versionId },
        include: {
          triggers: true,
          createdByAdmin: { select: { id: true, name: true } }
        }
      });
    });
  }

  async publishVersion(
    tenantId: string,
    flowId: string,
    versionId: string,
    adminId: string
  ) {
    await assertFlowAdmin(tenantId, adminId);
    const version = await this.getVersion(tenantId, flowId, versionId);

    if (version.status !== "DRAFT") {
      throw new FlowHttpError("Solo se pueden publicar versiones en borrador", 409, "version_not_draft");
    }

    parseFlowDefinitionGraph(version.graphJson);

    const publishedAt = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.flowVersion.update({
        where: { id: versionId },
        data: { status: "PUBLISHED", publishedAt }
      });

      const flow = await tx.flowDefinition.update({
        where: { id: flowId },
        data: {
          status: "ACTIVE",
          currentVersionId: versionId,
          updatedByAdminId: adminId
        },
        include: {
          createdByAdmin: { select: { id: true, name: true } },
          updatedByAdmin: { select: { id: true, name: true } },
          currentVersion: { include: { triggers: true } }
        }
      });

      return flow;
    });
  }
}

export const flowsService = new FlowsService();

export function validateFlowGraphLoose(input: unknown): FlowDefinitionGraph {
  return flowDefinitionGraphSchema.parse(input);
}
