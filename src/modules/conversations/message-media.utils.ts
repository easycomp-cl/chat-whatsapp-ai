import { ContentType } from "@prisma/client";

export type MediaContentType =
  | typeof ContentType.IMAGE
  | typeof ContentType.DOCUMENT
  | typeof ContentType.AUDIO;

export const WHATSAPP_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
export const WHATSAPP_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
export const WHATSAPP_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "audio/opus",
  "audio/webm"
]);

export const WHATSAPP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WHATSAPP_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;
export const WHATSAPP_AUDIO_MAX_BYTES = 16 * 1024 * 1024;

export function extensionFromMime(mimeType: string, fallback = "bin"): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("amr")) return "amr";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("ms-excel")) return "xls";
  if (mime.includes("presentationml")) return "pptx";
  if (mime.includes("ms-powerpoint")) return "ppt";
  if (mime.includes("plain")) return "txt";
  return fallback;
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? mimeType.toLowerCase();
}

export function isWhatsAppAudioMime(mimeType: string): boolean {
  const normalized = normalizeMimeType(mimeType);
  return (
    WHATSAPP_AUDIO_MIME_TYPES.has(normalized) ||
    normalized.startsWith("audio/")
  );
}

export function contentTypeFromMime(mimeType: string): MediaContentType {
  const normalized = normalizeMimeType(mimeType);
  if (WHATSAPP_IMAGE_MIME_TYPES.has(normalized)) {
    return ContentType.IMAGE;
  }
  if (isWhatsAppAudioMime(normalized)) {
    return ContentType.AUDIO;
  }
  return ContentType.DOCUMENT;
}

export function contentTypeFromWhatsAppMediaType(
  type: "image" | "document" | "audio"
): MediaContentType {
  if (type === "image") return ContentType.IMAGE;
  if (type === "audio") return ContentType.AUDIO;
  return ContentType.DOCUMENT;
}

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  const cleaned = base.replace(/[^\w.\-() ]+/g, "_");
  return cleaned.slice(0, 200) || "archivo";
}

export function defaultFilenameForMime(contentType: MediaContentType, mimeType: string): string {
  const ext = extensionFromMime(mimeType, contentType === ContentType.IMAGE ? "jpg" : "bin");
  if (contentType === ContentType.IMAGE) return `imagen.${ext}`;
  if (contentType === ContentType.AUDIO) return `audio.${ext}`;
  return `documento.${ext}`;
}

export function validateOutboundMediaMime(mimeType: string): {
  ok: true;
  contentType: MediaContentType;
} | {
  ok: false;
  error: string;
} {
  const normalized = normalizeMimeType(mimeType);
  if (WHATSAPP_IMAGE_MIME_TYPES.has(normalized)) {
    return { ok: true, contentType: ContentType.IMAGE };
  }
  if (isWhatsAppAudioMime(normalized)) {
    return { ok: true, contentType: ContentType.AUDIO };
  }
  if (WHATSAPP_DOCUMENT_MIME_TYPES.has(normalized)) {
    return { ok: true, contentType: ContentType.DOCUMENT };
  }
  return {
    ok: false,
    error:
      "Tipo de archivo no soportado por WhatsApp. Imágenes: JPEG/PNG. Audio: OGG, MP3, AAC, AMR, M4A. Documentos: PDF, Word, Excel, PowerPoint, TXT."
  };
}

export function validateOutboundMediaSize(contentType: MediaContentType, sizeBytes: number): string | null {
  if (contentType === ContentType.IMAGE && sizeBytes > WHATSAPP_IMAGE_MAX_BYTES) {
    return "La imagen supera el límite de WhatsApp (5 MB)";
  }
  if (contentType === ContentType.AUDIO && sizeBytes > WHATSAPP_AUDIO_MAX_BYTES) {
    return "El audio supera el límite de WhatsApp (16 MB)";
  }
  if (contentType === ContentType.DOCUMENT && sizeBytes > WHATSAPP_DOCUMENT_MAX_BYTES) {
    return "El documento supera el límite de WhatsApp (100 MB)";
  }
  return null;
}

export function buildMessageMediaStoragePath(input: {
  tenantId: string;
  conversationId: string;
  messageId: string;
  filename: string;
}): string {
  return [
    "tenants",
    input.tenantId,
    "conversations",
    input.conversationId,
    "messages",
    input.messageId,
    sanitizeFilename(input.filename)
  ].join("/");
}
