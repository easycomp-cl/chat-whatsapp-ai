import { ContentType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import type { IncomingMediaAttachment } from "../../types/whatsapp.js";
import {
  buildMessageMediaStoragePath,
  contentTypeFromWhatsAppMediaType,
  defaultFilenameForMime,
  isMissingMediaStorageError,
  sanitizeFilename,
  type MediaContentType
} from "./message-media.utils.js";
import { chatMediaStorageService } from "./infrastructure/chat-media-storage.service.js";

export class MessageMediaHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "MessageMediaHttpError";
  }
}

function rethrowMediaReadError(error: unknown): never {
  if (isMissingMediaStorageError(error)) {
    throw new MessageMediaHttpError(
      "El archivo adjunto ya no está disponible",
      404,
      "media_not_found"
    );
  }

  throw error;
}

export class MessageMediaService {
  constructor(private readonly whatsAppClient = new WhatsAppClient()) {}

  async ingestInboundFromWhatsApp(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    accessToken: string;
    media: IncomingMediaAttachment;
  }) {
    const downloaded = await this.whatsAppClient.downloadMediaBuffer(
      input.media.mediaId,
      input.accessToken
    );

    const mimeType =
      downloaded.mimeType ?? input.media.mimeType ?? "application/octet-stream";
    const filename = sanitizeFilename(
      input.media.filename ??
        defaultFilenameForMime(
          contentTypeFromWhatsAppMediaType(input.media.type),
          mimeType
        )
    );

    const storagePath = buildMessageMediaStoragePath({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      filename
    });

    const stored = await chatMediaStorageService.saveBuffer({
      storagePath,
      buffer: downloaded.buffer,
      mimeType
    });

    await prisma.message.update({
      where: { id: input.messageId },
      data: {
        contentType: contentTypeFromWhatsAppMediaType(input.media.type),
        mediaStorageBucket: stored.storageBucket,
        mediaStoragePath: stored.storagePath,
        mediaMimeType: mimeType,
        mediaFilename: filename,
        mediaFileSize: downloaded.buffer.length,
        whatsappMediaId: input.media.mediaId
      }
    });
  }

  async storeOutboundBuffer(input: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
    contentType: MediaContentType;
  }) {
    const safeFilename = sanitizeFilename(input.filename);
    const storagePath = buildMessageMediaStoragePath({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      filename: safeFilename
    });

    const stored = await chatMediaStorageService.saveBuffer({
      storagePath,
      buffer: input.buffer,
      mimeType: input.mimeType
    });

    await prisma.message.update({
      where: { id: input.messageId },
      data: {
        contentType: input.contentType,
        mediaStorageBucket: stored.storageBucket,
        mediaStoragePath: stored.storagePath,
        mediaMimeType: input.mimeType,
        mediaFilename: safeFilename,
        mediaFileSize: input.buffer.length
      }
    });
  }

  async sendStoredMessageToWhatsApp(input: {
    messageId: string;
    phoneNumberId: string;
    accessToken: string;
    to: string;
    replyToExternalId?: string;
  }): Promise<string | null> {
    const message = await prisma.message.findUnique({ where: { id: input.messageId } });
    if (!message?.mediaStoragePath || !message.mediaStorageBucket || !message.mediaMimeType) {
      throw new MessageMediaHttpError("El mensaje no tiene archivo adjunto", 400, "no_media");
    }

    let buffer: Buffer;
    try {
      buffer = await chatMediaStorageService.readBuffer(
        message.mediaStorageBucket,
        message.mediaStoragePath
      );
    } catch (error) {
      rethrowMediaReadError(error);
    }

    const mediaId = await this.whatsAppClient.uploadMedia({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      buffer,
      mimeType: message.mediaMimeType,
      filename: message.mediaFilename ?? "archivo"
    });

    const caption = message.contentText.trim();
    const hasCaption =
      caption.length > 0 &&
      caption !== "[Imagen]" &&
      caption !== "[Documento]" &&
      caption !== "[Audio]" &&
      caption !== (message.mediaFilename ?? "");

    if (message.contentType === ContentType.IMAGE) {
      return this.whatsAppClient.sendImageMessage({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        to: input.to,
        mediaId,
        ...(hasCaption ? { caption } : {}),
        ...(input.replyToExternalId ? { replyToExternalId: input.replyToExternalId } : {})
      });
    }

    if (message.contentType === ContentType.DOCUMENT) {
      return this.whatsAppClient.sendDocumentMessage({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        to: input.to,
        mediaId,
        filename: message.mediaFilename ?? "documento.pdf",
        ...(hasCaption ? { caption } : {}),
        ...(input.replyToExternalId ? { replyToExternalId: input.replyToExternalId } : {})
      });
    }

    if (message.contentType === ContentType.AUDIO) {
      return this.whatsAppClient.sendAudioMessage({
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
        to: input.to,
        mediaId,
        ...(input.replyToExternalId ? { replyToExternalId: input.replyToExternalId } : {})
      });
    }

    throw new MessageMediaHttpError("Tipo de contenido no soportado para envío WA", 400);
  }

  async getMediaAccessForMessage(tenantId: string, messageId: string, expiresInSeconds = 3600) {
    const message = await prisma.message.findFirst({
      where: { id: messageId, tenantId }
    });

    if (!message) {
      throw new MessageMediaHttpError("Mensaje no encontrado", 404);
    }

    if (!message.mediaStoragePath || !message.mediaStorageBucket) {
      throw new MessageMediaHttpError("Este mensaje no tiene archivo adjunto", 404, "no_media");
    }

    if (
      message.mediaStorageBucket === chatMediaStorageService.localBucket ||
      message.mediaStorageBucket === "local"
    ) {
      return {
        message,
        mediaUrl: `/messages/${message.id}/media/file`,
        expiresInSeconds,
        backendProxy: true
      };
    }

    const access = await chatMediaStorageService.createAccessUrl(
      message.mediaStorageBucket,
      message.mediaStoragePath,
      expiresInSeconds
    );

    return {
      message,
      mediaUrl: access.url,
      expiresInSeconds: access.expiresInSeconds,
      backendProxy: false
    };
  }

  async readMessageMediaBuffer(tenantId: string, messageId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    filename: string | null;
  }> {
    const message = await prisma.message.findFirst({
      where: { id: messageId, tenantId }
    });

    if (!message?.mediaStoragePath || !message.mediaStorageBucket) {
      throw new MessageMediaHttpError("Este mensaje no tiene archivo adjunto", 404, "no_media");
    }

    let buffer: Buffer;
    try {
      buffer = await chatMediaStorageService.readBuffer(
        message.mediaStorageBucket,
        message.mediaStoragePath
      );
    } catch (error) {
      rethrowMediaReadError(error);
    }

    return {
      buffer,
      mimeType: message.mediaMimeType ?? "application/octet-stream",
      filename: message.mediaFilename
    };
  }

  async safeIngestInbound(input: Parameters<MessageMediaService["ingestInboundFromWhatsApp"]>[0]) {
    try {
      await this.ingestInboundFromWhatsApp(input);
    } catch (error) {
      logger.error(
        { err: error, messageId: input.messageId, mediaId: input.media.mediaId },
        "Failed to download/store inbound WhatsApp media"
      );
    }
  }
}

export const messageMediaService = new MessageMediaService();
