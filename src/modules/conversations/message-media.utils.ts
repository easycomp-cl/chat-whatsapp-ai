import { ContentType } from "@prisma/client";

export type MediaContentType = typeof ContentType.IMAGE | typeof ContentType.DOCUMENT;

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

export const WHATSAPP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WHATSAPP_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;

export function extensionFromMime(mimeType: string, fallback = "bin"): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("ms-excel")) return "xls";
  if (mime.includes("presentationml")) return "pptx";
  if (mime.includes("ms-powerpoint")) return "ppt";
  if (mime.includes("plain")) return "txt";
  return fallback;
}

export function contentTypeFromMime(mimeType: string): MediaContentType {
  return WHATSAPP_IMAGE_MIME_TYPES.has(mimeType.toLowerCase())
    ? ContentType.IMAGE
    : ContentType.DOCUMENT;
}

export function contentTypeFromWhatsAppMediaType(
  type: "image" | "document"
): MediaContentType {
  return type === "image" ? ContentType.IMAGE : ContentType.DOCUMENT;
}

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  const cleaned = base.replace(/[^\w.\-() ]+/g, "_");
  return cleaned.slice(0, 200) || "archivo";
}

export function defaultFilenameForMime(contentType: MediaContentType, mimeType: string): string {
  const ext = extensionFromMime(mimeType, contentType === ContentType.IMAGE ? "jpg" : "pdf");
  return contentType === ContentType.IMAGE ? `imagen.${ext}` : `documento.${ext}`;
}

export function validateOutboundMediaMime(mimeType: string): {
  ok: true;
  contentType: MediaContentType;
} | {
  ok: false;
  error: string;
} {
  const normalized = mimeType.toLowerCase();
  if (WHATSAPP_IMAGE_MIME_TYPES.has(normalized)) {
    return { ok: true, contentType: ContentType.IMAGE };
  }
  if (WHATSAPP_DOCUMENT_MIME_TYPES.has(normalized)) {
    return { ok: true, contentType: ContentType.DOCUMENT };
  }
  return {
    ok: false,
    error:
      "Tipo de archivo no soportado por WhatsApp. Imágenes: JPEG/PNG. Documentos: PDF, Word, Excel, PowerPoint, TXT."
  };
}

export function validateOutboundMediaSize(contentType: MediaContentType, sizeBytes: number): string | null {
  if (contentType === ContentType.IMAGE && sizeBytes > WHATSAPP_IMAGE_MAX_BYTES) {
    return "La imagen supera el límite de WhatsApp (5 MB)";
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
