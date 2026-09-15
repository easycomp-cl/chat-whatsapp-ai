import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { serializeFlowReview, serializeFlowRun } from "../flows/domain/flow-serializers.js";
import { flowEngineService } from "../flows/flow-engine.service.js";
import { flowDeliveryService } from "../flows/flow-delivery.service.js";
import { flowFileService } from "../flows/flow-file.service.js";
import { FlowHttpError } from "../flows/flows.errors.js";

const startFlowSchema = z.object({
  started_by_admin_id: z.string().optional(),
  version_id: z.string().optional()
});

const agentInputSchema = z.object({
  values: z.record(z.unknown()),
  submitted_by_admin_id: z.string().min(1)
});

const resolveReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  notes: z.string().optional(),
  reviewer_admin_id: z.string().min(1)
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

async function getRunForTenant(businessId: string, runId: string) {
  const run = await prisma.flowRun.findFirst({
    where: { id: runId, tenantId: businessId },
    include: {
      flowVersion: {
        include: {
          flowDefinition: { select: { id: true, name: true } }
        }
      },
      reviews: {
        where: { status: { in: ["PENDING", "IN_REVIEW"] } },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  if (!run) {
    throw new FlowHttpError("Ejecución no encontrada", 404);
  }
  return run;
}

export async function startConversationFlow(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const conversationId = paramId(req, "conversationId");
  const flowId = paramId(req, "flowId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = startFlowSchema.parse(req.body ?? {});
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: businessId },
      select: { id: true, customerId: true }
    });
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const result = await flowEngineService.start({
      tenantId: businessId,
      flowDefinitionId: flowId,
      conversationId,
      customerId: conversation.customerId,
      startedBy: "MANUAL",
      ...(body.started_by_admin_id ? { startedByAdminId: body.started_by_admin_id } : {}),
      ...(body.version_id ? { versionId: body.version_id } : {})
    });

    res.status(201).json({
      ...serializeFlowRun(
        await prisma.flowRun.findUniqueOrThrow({
          where: { id: result.runId }
        })
      ),
      replies: result.replies
    });
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function getFlowRun(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const runId = paramId(req, "runId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const run = await getRunForTenant(businessId, runId);
    res.json({
      ...serializeFlowRun(run),
      flow_name: run.flowVersion.flowDefinition.name,
      flow_version: run.flowVersion.versionNumber,
      pending_review: run.reviews[0] ? serializeFlowReview(run.reviews[0]) : null
    });
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function pauseFlowRun(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const runId = paramId(req, "runId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    await flowEngineService.pause(runId, businessId);
    const run = await getRunForTenant(businessId, runId);
    res.json(serializeFlowRun(run));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function resumeFlowRun(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const runId = paramId(req, "runId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const result = await flowEngineService.resume(runId, businessId);
    const run = await getRunForTenant(businessId, runId);
    res.json({ ...serializeFlowRun(run), replies: result.replies });
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function cancelFlowRun(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const runId = paramId(req, "runId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    await flowEngineService.cancel(runId, businessId);
    const run = await getRunForTenant(businessId, runId);
    res.json(serializeFlowRun(run));
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function retryFlowRun(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const runId = paramId(req, "runId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const result = await flowEngineService.processEvent({ runId, tenantId: businessId });
    const run = await getRunForTenant(businessId, runId);
    res.json({ ...serializeFlowRun(run), replies: result.replies });
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function submitFlowRunAgentInput(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const runId = paramId(req, "runId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = agentInputSchema.parse(req.body);
    const run = await getRunForTenant(businessId, runId);
    const result = await flowEngineService.processEvent({
      runId,
      tenantId: businessId,
      agentInput: body.values
    });
    const sentMessages = await flowDeliveryService.deliverBotReplies({
      tenantId: businessId,
      conversationId: run.conversationId,
      replies: result.replies
    });
    const updatedRun = await getRunForTenant(businessId, runId);
    res.json({ ...serializeFlowRun(updatedRun), replies: result.replies, sent_messages: sentMessages });
  } catch (error) {
    handleFlowError(res, error);
  }
}

export async function listFlowReviews(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await ensureBusiness(res, businessId))) return;

  const status = typeof req.query.status === "string" ? req.query.status : "PENDING";
  const reviews = await prisma.flowReview.findMany({
    where: { tenantId: businessId, status: status as never },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  const enriched = await Promise.all(
    reviews.map(async (review) => {
      const base = serializeFlowReview(review);
      if (review.subjectType !== "file" || !review.subjectReference) {
        return base;
      }

      try {
        const { file, signedUrl, expiresInSeconds } = await flowFileService.getSignedUrlForFile(
          businessId,
          review.subjectReference
        );
        return {
          ...base,
          file: {
            id: file.id,
            original_filename: file.originalFilename,
            mime_type: file.mimeType,
            file_size: file.fileSize,
            signed_url: signedUrl,
            signed_url_expires_in_seconds: expiresInSeconds
          }
        };
      } catch {
        return base;
      }
    })
  );

  res.json(enriched);
}

export async function resolveFlowReview(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const reviewId = paramId(req, "reviewId");
  if (!(await ensureBusiness(res, businessId))) return;

  try {
    const body = resolveReviewSchema.parse(req.body);
    const review = await prisma.flowReview.findFirst({
      where: { id: reviewId, tenantId: businessId }
    });
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    const result = await flowEngineService.processEvent({
      runId: review.flowRunId,
      tenantId: businessId,
      reviewResolution: {
        reviewId,
        status: body.status,
        ...(body.notes !== undefined ? { notes: body.notes } : {})
      }
    });

    const run = await prisma.flowRun.findUniqueOrThrow({
      where: { id: review.flowRunId },
      select: { conversationId: true }
    });
    const sentMessages = await flowDeliveryService.deliverBotReplies({
      tenantId: businessId,
      conversationId: run.conversationId,
      replies: result.replies
    });

    const updated = await prisma.flowReview.findUniqueOrThrow({ where: { id: reviewId } });
    res.json({
      review: serializeFlowReview(updated),
      run: serializeFlowRun(
        await prisma.flowRun.findUniqueOrThrow({ where: { id: review.flowRunId } })
      ),
      replies: result.replies,
      sent_messages: sentMessages
    });
  } catch (error) {
    handleFlowError(res, error);
  }
}
