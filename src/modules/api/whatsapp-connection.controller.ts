import type { Request, Response } from "express";
import { WhatsAppSendError } from "../channel/whatsapp.client.js";
import { paramId } from "../../utils/params.js";
import { WhatsAppConnectionError } from "../whatsapp-connection/whatsapp-connection.errors.js";
import {
  embeddedSignupCompleteSchema,
  whatsappConnectionQuerySchema,
  whatsappTestMessageSchema
} from "../whatsapp-connection/whatsapp-connection.schema.js";
import { whatsappConnectionService } from "../whatsapp-connection/whatsapp-connection.service.js";
import { enqueueProvisionStandardTemplatesSafe } from "../queue/whatsapp-templates.queue.js";

function resolveTenantId(req: Request, bodyTenantId?: string): string | null {
  const fromParams =
    typeof req.params.id === "string" && req.params.id
      ? req.params.id
      : typeof req.params.businessId === "string" && req.params.businessId
        ? req.params.businessId
        : null;
  return fromParams ?? bodyTenantId ?? null;
}

function sendConnectionError(res: Response, error: unknown): boolean {
  if (error instanceof WhatsAppConnectionError) {
    res.status(error.statusCode).json({
      ok: false,
      error: error.code,
      message: error.message
    });
    return true;
  }
  if (error instanceof WhatsAppSendError) {
    res.status(error.status >= 400 && error.status < 600 ? error.status : 502).json({
      ok: false,
      error: error.isTokenExpired ? "token_expired" : "whatsapp_send_failed",
      message: error.message
    });
    return true;
  }
  return false;
}

export async function completeEmbeddedSignup(req: Request, res: Response) {
  const body = embeddedSignupCompleteSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req, body.tenant_id);
  if (!tenantId) {
    res.status(400).json({
      ok: false,
      error: "tenant_required",
      message: "Indica tenant_id (o usa /businesses/:id/whatsapp/embedded-signup/complete)."
    });
    return;
  }

  if (body.tenant_id && body.tenant_id !== tenantId && req.params.id) {
    res.status(403).json({
      ok: false,
      error: "tenant_mismatch",
      message: "tenant_id no coincide con el negocio de la URL."
    });
    return;
  }

  try {
    const result = await whatsappConnectionService.completeEmbeddedSignup(tenantId, body);
    void enqueueProvisionStandardTemplatesSafe(tenantId);
    res.status(200).json(result);
  } catch (error) {
    if (sendConnectionError(res, error)) return;
    throw error;
  }
}

export async function getWhatsappConnection(req: Request, res: Response) {
  const query = whatsappConnectionQuerySchema.parse(req.query);
  const tenantId = resolveTenantId(req, query.tenant_id);
  if (!tenantId) {
    res.status(400).json({
      ok: false,
      error: "tenant_required",
      message: "Indica tenant_id (query) o usa /businesses/:id/whatsapp/connection."
    });
    return;
  }

  const connection = await whatsappConnectionService.getConnection(tenantId);
  if (!connection) {
    res.status(404).json({
      ok: false,
      error: "tenant_not_found",
      message: "No existe el negocio indicado."
    });
    return;
  }

  res.json(connection);
}

export async function sendWhatsappTestMessage(req: Request, res: Response) {
  const body = whatsappTestMessageSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req, body.tenant_id);
  if (!tenantId) {
    res.status(400).json({
      ok: false,
      error: "tenant_required",
      message: "Indica tenant_id o usa /businesses/:id/whatsapp/connection/test-message."
    });
    return;
  }

  try {
    const result = await whatsappConnectionService.sendTestMessage({
      tenantId,
      to: body.to,
      ...(body.text ? { text: body.text } : {})
    });
    res.json(result);
  } catch (error) {
    if (sendConnectionError(res, error)) return;
    throw error;
  }
}
