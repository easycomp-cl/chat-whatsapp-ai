import type { Request, Response } from "express";
import { WhatsAppSendError } from "../channel/whatsapp.client.js";
import { paramId } from "../../utils/params.js";
import { serializeMessage } from "../conversations/message-serializer.js";
import { WhatsappTemplateError } from "../whatsapp-templates/whatsapp-templates.errors.js";
import {
  listTemplatesQuerySchema,
  sendConversationTemplateSchema
} from "../whatsapp-templates/whatsapp-templates.schema.js";
import { whatsappTemplatesService } from "../whatsapp-templates/whatsapp-templates.service.js";

function sendTemplateError(res: Response, error: unknown): boolean {
  if (error instanceof WhatsappTemplateError) {
    res.status(error.statusCode).json({
      ok: false,
      error: error.code,
      message: error.message
    });
    return true;
  }
  if (error instanceof WhatsAppSendError) {
    res.status(error.isTokenExpired ? 503 : 502).json({
      ok: false,
      error: error.isTokenExpired ? "token_expired" : "whatsapp_send_failed",
      message: error.message,
      action: error.action,
      token_expired: error.isTokenExpired
    });
    return true;
  }
  return false;
}

export async function listWhatsappTemplates(req: Request, res: Response) {
  const businessId = paramId(req, "id");
  const query = listTemplatesQuerySchema.parse(req.query);
  try {
    const result = await whatsappTemplatesService.listTemplates(businessId, query.status);
    res.json(result);
  } catch (error) {
    if (sendTemplateError(res, error)) return;
    throw error;
  }
}

export async function provisionDefaultWhatsappTemplates(req: Request, res: Response) {
  const businessId = paramId(req, "id");
  try {
    const result = await whatsappTemplatesService.provisionDefaults(businessId);
    res.status(200).json(result);
  } catch (error) {
    if (sendTemplateError(res, error)) return;
    throw error;
  }
}

export async function sendConversationTemplateMessage(req: Request, res: Response) {
  const conversationId = paramId(req, "id");
  const body = sendConversationTemplateSchema.parse(req.body ?? {});
  try {
    const message = await whatsappTemplatesService.sendConversationTemplate(
      conversationId,
      body
    );
    res.status(201).json(serializeMessage(message));
  } catch (error) {
    if (sendTemplateError(res, error)) return;
    throw error;
  }
}
