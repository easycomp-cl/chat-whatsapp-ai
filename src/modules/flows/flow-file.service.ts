import { ContentType } from "@prisma/client";
import path from "node:path";
import { prisma } from "../../lib/prisma.js";
import { WhatsAppClient } from "../channel/whatsapp.client.js";
import type { IncomingMediaAttachment } from "../../types/whatsapp.js";
import {
  buildFlowFileStoragePath,
  flowSupabaseStorageService
} from "./infrastructure/flow-supabase-storage.service.js";
import { FlowHttpError } from "./flows.errors.js";

function extensionFromMime(mimeType?: string, fallback = "bin"): string {
  if (!mimeType) {
    return fallback;
  }
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("svg")) return "svg";
  return fallback;
}

export class FlowFileService {
  constructor(private readonly whatsAppClient = new WhatsAppClient()) {}

  async ingestWhatsAppMedia(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    flowRunId?: string;
    messageExternalId: string;
    media: IncomingMediaAttachment;
    accessToken: string;
  }) {
    if (!flowSupabaseStorageService.isConfigured()) {
      throw new FlowHttpError(
        "Supabase Storage no configurado para archivos de flujo",
        503,
        "supabase_not_configured"
      );
    }

    const downloaded = await this.whatsAppClient.downloadMediaBuffer(
      input.media.mediaId,
      input.accessToken
    );

    const mimeType = downloaded.mimeType ?? input.media.mimeType ?? "application/octet-stream";
    const filename =
      input.media.filename ??
      `${input.media.type}.${extensionFromMime(mimeType, input.media.type === "image" ? "jpg" : "pdf")}`;

    const storagePath = buildFlowFileStoragePath({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      ...(input.flowRunId ? { flowRunId: input.flowRunId } : {}),
      messageExternalId: input.messageExternalId,
      filename: path.basename(filename)
    });

    await flowSupabaseStorageService.uploadBuffer({
      storagePath,
      buffer: downloaded.buffer,
      mimeType
    });

    const flowFile = await prisma.flowFile.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        flowRunId: input.flowRunId ?? null,
        storageBucket: flowSupabaseStorageService.bucket,
        storagePath,
        mimeType,
        fileSize: downloaded.buffer.length,
        originalFilename: filename,
        source: "WHATSAPP_INBOUND"
      }
    });

    return flowFile;
  }

  async getSignedUrlForFile(tenantId: string, fileId: string, expiresInSeconds = 3600) {
    const file = await prisma.flowFile.findFirst({
      where: { id: fileId, tenantId }
    });
    if (!file) {
      throw new FlowHttpError("Archivo no encontrado", 404);
    }

    const signedUrl = await flowSupabaseStorageService.createSignedUrl(
      file.storagePath,
      expiresInSeconds
    );

    return { file, signedUrl, expiresInSeconds };
  }

  mapContentType(media: IncomingMediaAttachment): ContentType {
    return media.type === "image" ? ContentType.IMAGE : ContentType.DOCUMENT;
  }
}

export const flowFileService = new FlowFileService();
