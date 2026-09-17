import type { Request, Response } from "express";
import { ProductQuoteCreatedBy } from "@prisma/client";
import { paramId } from "../../utils/params.js";
import { logger } from "../../lib/logger.js";
import { WhatsAppSendError } from "../channel/whatsapp.client.js";
import { MessageMediaHttpError } from "../conversations/message-media.service.js";
import { buildMediaMessageResponse } from "./message-media.controller.js";
import { ProductQuoteHttpError } from "../quotes/product-quote.errors.js";
import { productQuoteRequestSchema } from "../quotes/product-quote.schema.js";
import { productQuoteService } from "../quotes/product-quote.service.js";
import { quotePdfFilename } from "../quotes/product-quote.utils.js";

function sendQuoteError(res: Response, error: unknown): boolean {
  if (error instanceof ProductQuoteHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return true;
  }
  if (error instanceof MessageMediaHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return true;
  }
  if (error instanceof WhatsAppSendError) {
    res.status(error.isTokenExpired ? 503 : 502).json({
      error: error.message,
      action: error.action,
      token_expired: error.isTokenExpired
    });
    return true;
  }
  return false;
}

export async function previewConversationQuote(req: Request, res: Response) {
  const conversationId = paramId(req, "id");
  const parsed = productQuoteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud inválida", details: parsed.error.flatten() });
    return;
  }

  try {
    const preview = await productQuoteService.preview(conversationId, parsed.data);
    res.json(preview);
  } catch (error) {
    if (sendQuoteError(res, error)) return;
    logger.error({ err: error, conversationId }, "Failed to preview product quote");
    res.status(500).json({ error: "No se pudo generar el preview de la cotización" });
  }
}

export async function downloadConversationQuotePdf(req: Request, res: Response) {
  const conversationId = paramId(req, "id");
  const parsed = productQuoteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud inválida", details: parsed.error.flatten() });
    return;
  }

  try {
    const issued = await productQuoteService.issuePdf(
      conversationId,
      parsed.data,
      ProductQuoteCreatedBy.HUMAN
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${quotePdfFilename(issued.preview.quote_number)}"`
    );
    res.setHeader("X-Quote-Number", issued.preview.quote_number);
    res.setHeader("X-Quote-Total", String(issued.preview.total));
    res.setHeader("Content-Length", String(issued.buffer.length));
    res.status(200).end(issued.buffer);
  } catch (error) {
    if (sendQuoteError(res, error)) return;
    logger.error({ err: error, conversationId }, "Failed to generate product quote PDF");
    res.status(500).json({ error: "No se pudo generar el PDF de la cotización" });
  }
}

export async function sendConversationQuote(req: Request, res: Response) {
  const conversationId = paramId(req, "id");
  const parsed = productQuoteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud inválida", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await productQuoteService.send(
      conversationId,
      parsed.data,
      ProductQuoteCreatedBy.BOT
    );
    res.status(201).json({
      quote: result.preview,
      message: buildMediaMessageResponse(result.message)
    });
  } catch (error) {
    if (sendQuoteError(res, error)) return;
    logger.error({ err: error, conversationId }, "Failed to send product quote");
    res.status(502).json({ error: "No se pudo enviar la cotización por WhatsApp" });
  }
}
