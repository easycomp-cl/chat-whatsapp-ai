import type { Request, Response } from "express";
import { z } from "zod";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { serializeFlowDefinition, serializeFlowVersion } from "../flows/domain/flow-serializers.js";
import { flowSimulatorService } from "../flows/flow-simulator.service.js";
import { FlowHttpError } from "../flows/flows.errors.js";
import { flowsService } from "../flows/flows.service.js";

const adminIdSchema = z.string().min(1);

const createFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  created_by_admin_id: adminIdSchema,
  template: z.enum(["default", "wood_quote"]).optional()
});

const patchFlowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  updated_by_admin_id: adminIdSchema
});

const createVersionSchema = z.object({
  created_by_admin_id: adminIdSchema,
  graph_json: z.unknown().optional(),
  source_version_id: z.string().optional(),
  triggers: z.array(z.unknown()).optional()
});

const updateVersionSchema = z.object({
  graph_json: z.unknown(),
  updated_by_admin_id: adminIdSchema,
  triggers: z.array(z.unknown()).optional()
});

const simulateSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["customer", "agent", "system"]),
        content: z.string(),
        created_at: z.string().optional()
      })
    )
    .default([]),
  version_id: z.string().optional(),
  graph_json: z.unknown().optional()
});

function handleFlowError(res: Response, error: unknown) {
  if (error instanceof FlowHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  throw error;
}

async function ensureBusiness(res: Response, businessId: string): Promise<boolean> {
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return false;
  }
  return true;
}

export async function listFlows(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await ensureBusiness(res, businessId))) return;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const flows = await flowsService.listFlows(
    businessId,
    status ? { status } : undefined
  );
  res.json(flows.map((f) => serializeFlowDefinition(f)));
}

export async function createFlow(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = createFlowSchema.parse(req.body);
    const flow = await flowsService.createFlow(businessId, {
      name: body.name,
      createdByAdminId: body.created_by_admin_id,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.template !== undefined ? { template: body.template } : {})
    });
    res.status(201).json(serializeFlowDefinition(flow));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function getFlow(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const flow = await flowsService.getFlow(businessId, flowId);
    res.json(serializeFlowDefinition(flow));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function patchFlow(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = patchFlowSchema.parse(req.body);
    const flow = await flowsService.patchFlow(businessId, flowId, {
      updatedByAdminId: body.updated_by_admin_id,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status !== undefined ? { status: body.status } : {})
    });
    res.json(serializeFlowDefinition(flow));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function deleteFlow(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  if (!(await ensureBusiness(res, businessId))) return;

  const adminId =
    typeof req.body?.updated_by_admin_id === "string"
      ? req.body.updated_by_admin_id
      : typeof req.query.admin_id === "string"
        ? req.query.admin_id
        : null;

  if (!adminId) {
    res.status(400).json({ error: "updated_by_admin_id es requerido" });
    return;
  }

  try {
    const archived = await flowsService.deleteFlow(businessId, flowId, adminId);
    if (!archived) {
      res.status(204).send();
      return;
    }
    res.json({ archived: true, flow: serializeFlowDefinition(archived) });
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function listFlowVersions(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const versions = await flowsService.listVersions(businessId, flowId);
    res.json(versions.map((v) => serializeFlowVersion(v)));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function getFlowVersion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  const versionId = paramId(req, "versionId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const version = await flowsService.getVersion(businessId, flowId, versionId);
    res.json(serializeFlowVersion(version));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function createFlowVersion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = createVersionSchema.parse(req.body);
    const version = await flowsService.createVersion(businessId, flowId, {
      createdByAdminId: body.created_by_admin_id,
      ...(body.graph_json !== undefined ? { graphJson: body.graph_json } : {}),
      ...(body.source_version_id !== undefined ? { sourceVersionId: body.source_version_id } : {}),
      ...(body.triggers !== undefined ? { triggers: body.triggers as never } : {})
    });
    res.status(201).json(serializeFlowVersion(version));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function updateFlowVersion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  const versionId = paramId(req, "versionId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = updateVersionSchema.parse(req.body);
    const version = await flowsService.updateVersionDraft(businessId, flowId, versionId, {
      graphJson: body.graph_json,
      updatedByAdminId: body.updated_by_admin_id,
      triggers: body.triggers as never
    });
    res.json(serializeFlowVersion(version));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function publishFlowVersion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  const versionId = paramId(req, "versionId");
  if (!(await ensureBusiness(res, businessId))) return;

  const body = z
    .object({ published_by_admin_id: adminIdSchema })
    .parse(req.body ?? {});

  try {
    const flow = await flowsService.publishVersion(
      businessId,
      flowId,
      versionId,
      body.published_by_admin_id
    );
    res.json(serializeFlowDefinition(flow));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function simulateFlow(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const flowId = paramId(req, "flowId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = simulateSchema.parse(req.body ?? {});
    let graph: unknown;

    if (body.graph_json) {
      graph = body.graph_json;
    } else if (body.version_id) {
      const version = await flowsService.getVersion(businessId, flowId, body.version_id);
      graph = version.graphJson;
    } else {
      const flow = await flowsService.getFlow(businessId, flowId);
      const draft = await flowsService.listVersions(businessId, flowId);
      const target =
        draft.find((v) => v.id === flow.currentVersionId) ??
        draft.find((v) => v.status === "DRAFT") ??
        draft[0];
      if (!target) {
        res.status(404).json({ error: "No hay versión para simular" });
        return;
      }
      graph = target.graphJson;
    }

    const result = flowSimulatorService.simulate(
      graph,
      body.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.created_at !== undefined ? { createdAt: m.created_at } : {})
      }))
    );

    res.json(result);
  } catch (error) {
    handleFlowError(res, error);
  }
}
