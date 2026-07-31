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
  readStoredAsVoiceNote,
  resolveOutboundAsVoiceNote,
  sanitizeFilename,
  type MediaContentType
} from "./message-media.utils.js";
import { chatMediaStorageService } from "./infrastructure/chat-media-storage.service.js";
import { prepareAudioBufferForWhatsApp } from "./audio-transcode.service.js";
import { MessageMediaHttpError } from "./message-media.errors.js";

export { MessageMediaHttpError } from "./message-media.errors.js";

function rethrowMediaUploadError(error: unknown): never {
  if (error instanceof Error && error.message.startsWith("Error subiendo media de chat a Supabase:")) {
    const detail = error.message.replace("Error subiendo media de chat a Supabase: ", "");
    throw new MessageMediaHttpError(`No se pudo guardar el archivo: ${detail}`, 400, "media_upload_failed");
  }

  throw error;
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

    let stored;
    try {
      stored = await chatMediaStorageService.saveBuffer({
        storagePath,
        buffer: downloaded.buffer,
        mimeType
      });
    } catch (error) {
      rethrowMediaUploadError(error);
    }

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
    asVoiceNote?: boolean;
  }) {
    const safeFilename = sanitizeFilename(input.filename);
    const storagePath = buildMessageMediaStoragePath({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      filename: safeFilename
    });

    let stored;
    try {
      stored = await chatMediaStorageService.saveBuffer({
        storagePath,
        buffer: input.buffer,
        mimeType: input.mimeType
      });
    } catch (error) {
      rethrowMediaUploadError(error);
    }

    await prisma.message.update({
      where: { id: input.messageId },
      data: {
        contentType: input.contentType,
        mediaStorageBucket: stored.storageBucket,
        mediaStoragePath: stored.storagePath,
        mediaMimeType: input.mimeType,
        mediaFilename: safeFilename,
        mediaFileSize: input.buffer.length,
        ...(input.contentType === ContentType.AUDIO
          ? {
              rawPayloadJson: {
                outbound: {
                  as_voice_note: input.asVoiceNote ?? true
                }
              }
            }
          : {})
      }
    });
  }

  async sendStoredMessageToWhatsApp(input: {
    messageId: string;
    phoneNumberId: string;
    accessToken: string;
    to: string;
    replyToExternalId?: string;
    asVoiceNote?: boolean;
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

    let uploadBuffer = buffer;
    let uploadMimeType = message.mediaMimeType;
    let uploadFilename = message.mediaFilename ?? "archivo";
    const storedAsVoiceNote = readStoredAsVoiceNote(message.rawPayloadJson);
    const asVoiceNote =
      message.contentType === ContentType.AUDIO
        ? resolveOutboundAsVoiceNote({
            contentType: ContentType.AUDIO,
            ...(input.asVoiceNote !== undefined ? { explicit: input.asVoiceNote } : {}),
            ...(storedAsVoiceNote !== undefined ? { storedFlag: storedAsVoiceNote } : {})
          })
        : false;

    if (message.contentType === ContentType.AUDIO) {
      const prepared = await prepareAudioBufferForWhatsApp(
        buffer,
        message.mediaMimeType ?? "application/octet-stream",
        message.mediaFilename,
        { voiceNote: asVoiceNote }
      );
      uploadBuffer = prepared.buffer;
      uploadMimeType = prepared.mimeType;
      uploadFilename = prepared.filename;
    }

    const mediaId = await this.whatsAppClient.uploadMedia({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      buffer: uploadBuffer,
      mimeType: uploadMimeType,
      filename: uploadFilename
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
        voice: asVoiceNote,
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
