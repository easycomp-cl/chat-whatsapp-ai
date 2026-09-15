import type { Request, Response } from "express";
import { z } from "zod";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { flowFileService } from "../flows/flow-file.service.js";
import { FlowHttpError } from "../flows/flows.errors.js";

const signedUrlQuerySchema = z.object({
  expires_in: z.coerce.number().int().min(60).max(86400).optional()
});

function handleFlowError(res: Response, error: unknown) {
  if (error instanceof FlowHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  throw error;
}

export async function getFlowFileSignedUrl(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const fileId = paramId(req, "fileId");

  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  try {
    const query = signedUrlQuerySchema.parse(req.query);
    const { file, signedUrl, expiresInSeconds } = await flowFileService.getSignedUrlForFile(
      businessId,
      fileId,
      query.expires_in ?? 3600
    );

    res.json({
      id: file.id,
      tenant_id: file.tenantId,
      conversation_id: file.conversationId,
      flow_run_id: file.flowRunId,
      original_filename: file.originalFilename,
      mime_type: file.mimeType,
      file_size: file.fileSize,
      signed_url: signedUrl,
      signed_url_expires_in_seconds: expiresInSeconds
    });
  } catch (error) {
    handleFlowError(res, error);
  }
}
