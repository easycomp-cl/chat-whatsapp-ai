import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { paramId } from "../../utils/params.js";
import {
  MessageMediaHttpError,
  messageMediaService
} from "../conversations/message-media.service.js";
import { isMissingMediaStorageError } from "../conversations/message-media.utils.js";
import { serializeMessage } from "../conversations/message-serializer.js";

const mediaUrlQuerySchema = z.object({
  expires_in: z.coerce.number().int().min(60).max(86400).optional()
});

function handleMediaError(res: Response, error: unknown) {
  if (res.headersSent) {
    return;
  }

  if (error instanceof MessageMediaHttpError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  if (isMissingMediaStorageError(error)) {
    res.status(404).json({
      error: "El archivo adjunto ya no está disponible",
      code: "media_not_found"
    });
    return;
  }

  logger.error({ err: error }, "Unexpected error serving message media");
  res.status(500).json({ error: "Error al obtener el archivo" });
}

async function resolveMessageTenantId(messageId: string): Promise<string | null> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { tenantId: true }
  });
  return message?.tenantId ?? null;
}

export async function getMessageMediaUrl(req: Request, res: Response) {
  const messageId = paramId(req, "id");

  try {
    const tenantId = await resolveMessageTenantId(messageId);
    if (!tenantId) {
      res.status(404).json({ error: "Mensaje no encontrado" });
      return;
    }

    const query = mediaUrlQuerySchema.parse(req.query);
    const result = await messageMediaService.getMediaAccessForMessage(
      tenantId,
      messageId,
      query.expires_in ?? 3600
    );

    res.json({
      message_id: result.message.id,
      content_type: result.message.contentType,
      mime_type: result.message.mediaMimeType,
      filename: result.message.mediaFilename,
      file_size: result.message.mediaFileSize,
      media_url: result.mediaUrl,
      backend_proxy: result.backendProxy,
      expires_in_seconds: result.expiresInSeconds
    });
  } catch (error) {
    handleMediaError(res, error);
  }
}

export async function streamMessageMediaFile(req: Request, res: Response) {
  const messageId = paramId(req, "id");

  try {
    const tenantId = await resolveMessageTenantId(messageId);
    if (!tenantId) {
      res.status(404).json({ error: "Mensaje no encontrado" });
      return;
    }

    const file = await messageMediaService.readMessageMediaBuffer(tenantId, messageId);
    res.setHeader("Content-Type", file.mimeType);
    if (file.filename) {
      res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
    }
    res.send(file.buffer);
  } catch (error) {
    handleMediaError(res, error);
  }
}

export function buildMediaMessageResponse(message: Parameters<typeof serializeMessage>[0]) {
  const serialized = serializeMessage(message);
  return {
    id: serialized.id,
    conversation_id: serialized.conversationId,
    direction: serialized.direction,
    sender_type: serialized.senderType,
    content_text: serialized.content_text,
    content_type: serialized.content_type,
    audio_transcript: serialized.audio_transcript,
    external_id: serialized.external_id,
    whatsapp_delivery_status: serialized.whatsapp_delivery_status,
    whatsapp_delivery_error_code: serialized.whatsapp_delivery_error_code,
    whatsapp_delivery_error_message: serialized.whatsapp_delivery_error_message,
    media_ingest_failed: serialized.media_ingest_failed,
    media_ingest_error: serialized.media_ingest_error,
    interactive: serialized.interactive,
    reply_to_message_id: serialized.reply_to_message_id,
    quoted_text: serialized.quoted_text,
    quoted_sender_type: serialized.quoted_sender_type,
    created_at: serialized.created_at,
    media: serialized.media
  };
}
