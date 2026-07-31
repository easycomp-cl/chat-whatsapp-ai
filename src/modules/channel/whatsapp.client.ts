import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { OutboundMessage } from "../../types/whatsapp.js";

type SendWhatsAppParams = OutboundMessage & {
  phoneNumberId: string;
  accessToken: string;
};

type EditWhatsAppTextParams = {
  phoneNumberId: string;
  accessToken: string;
  externalMessageId: string;
  to: string;
  text: string;
};

type GraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MediaUrlResponse = {
  url?: string;
  mime_type?: string;
  file_size?: number;
};

type SendMediaBaseParams = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  mediaId: string;
  caption?: string;
  replyToExternalId?: string;
  voice?: boolean;
};

type UploadMediaParams = {
  phoneNumberId: string;
  accessToken: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

type UploadMediaResponse = {
  id?: string;
};

type SendDocumentParams = SendMediaBaseParams & {
  filename: string;
};

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly action: string,
    readonly isTokenExpired = false
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }

  /** Errores de auth/config no deben reintentar el job (evita respuestas duplicadas en BD). */
  get isRetryable(): boolean {
    if (this.isTokenExpired) return false;
    if (this.status === 401 || this.status === 403) return false;
    return this.status >= 500 || this.status === 408 || this.status === 429;
  }
}

type SendMessageResponse = {
  messages?: Array<{ id: string }>;
};

export class WhatsAppClient {
  async sendTextMessage(params: SendWhatsAppParams): Promise<string | null> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "text",
      text: {
        body: params.text,
        preview_url: params.previewUrl ?? false
      }
    };

    if (params.replyToExternalId) {
      payload.context = { message_id: params.replyToExternalId };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await this.buildSendError(response, params.to, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as SendMessageResponse;
    return json.messages?.[0]?.id ?? null;
  }

  async sendInteractiveButtonMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: string;
    buttons: Array<{ id: string; title: string }>;
    replyToExternalId?: string;
  }): Promise<string | null> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: params.body },
        action: {
          buttons: params.buttons.map((button) => ({
            type: "reply",
            reply: {
              id: button.id,
              title: button.title
            }
          }))
        }
      }
    };

    if (params.replyToExternalId) {
      payload.context = { message_id: params.replyToExternalId };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await this.buildSendError(response, params.to, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as SendMessageResponse;
    return json.messages?.[0]?.id ?? null;
  }

  async sendInteractiveListMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    body: string;
    buttonText: string;
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
    replyToExternalId?: string;
  }): Promise<string | null> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: params.body },
        action: {
          button: params.buttonText,
          sections: params.sections.map((section) => ({
            ...(section.title ? { title: section.title } : {}),
            rows: section.rows.map((row) => ({
              id: row.id,
              title: row.title,
              ...(row.description ? { description: row.description } : {})
            }))
          }))
        }
      }
    };

    if (params.replyToExternalId) {
      payload.context = { message_id: params.replyToExternalId };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await this.buildSendError(response, params.to, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as SendMessageResponse;
    return json.messages?.[0]?.id ?? null;
  }

  async editTextMessage(params: EditWhatsAppTextParams): Promise<void> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "text",
      text: {
        body: params.text
      },
      edit: {
        message_id: params.externalMessageId
      }
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await this.buildSendError(response, undefined, params.phoneNumberId, "edit");
    }
  }

  async uploadMedia(params: UploadMediaParams): Promise<string> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/media`;
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", params.mimeType);
    form.append(
      "file",
      new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }),
      params.filename
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      body: form
    });

    if (!response.ok) {
      throw await this.buildSendError(response, undefined, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as UploadMediaResponse;
    if (!json.id) {
      throw new Error("WhatsApp no devolvió media id al subir archivo");
    }

    return json.id;
  }

  async sendImageMessage(params: SendMediaBaseParams): Promise<string | null> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "image",
      image: {
        id: params.mediaId,
        ...(params.caption ? { caption: params.caption } : {})
      }
    };

    if (params.replyToExternalId) {
      payload.context = { message_id: params.replyToExternalId };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await this.buildSendError(response, params.to, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as SendMessageResponse;
    return json.messages?.[0]?.id ?? null;
  }

  async sendAudioMessage(params: SendMediaBaseParams): Promise<string | null> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "audio",
      audio: {
        id: params.mediaId,
        ...(params.voice ? { voice: true } : {})
      }
    };

    if (params.replyToExternalId) {
      payload.context = { message_id: params.replyToExternalId };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await this.buildSendError(response, params.to, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as SendMessageResponse;
    return json.messages?.[0]?.id ?? null;
  }

  async sendDocumentMessage(params: SendDocumentParams): Promise<string | null> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "document",
      document: {
        id: params.mediaId,
        filename: params.filename,
        ...(params.caption ? { caption: params.caption } : {})
      }
    };

    if (params.replyToExternalId) {
      payload.context = { message_id: params.replyToExternalId };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw await this.buildSendError(response, params.to, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as SendMessageResponse;
    return json.messages?.[0]?.id ?? null;
  }

  async getMediaMetadata(mediaId: string, accessToken: string): Promise<MediaUrlResponse> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${mediaId}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`No se pudo obtener metadata del media ${mediaId}: ${response.status} ${body}`);
    }

    return (await response.json()) as MediaUrlResponse;
  }

  async downloadMediaBuffer(mediaId: string, accessToken: string): Promise<{
    buffer: Buffer;
    mimeType?: string;
  }> {
    const metadata = await this.getMediaMetadata(mediaId, accessToken);
    if (!metadata.url) {
      throw new Error(`Media ${mediaId} no tiene URL de descarga`);
    }

    const response = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`No se pudo descargar media ${mediaId}: ${response.status} ${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      ...(metadata.mime_type ? { mimeType: metadata.mime_type } : {})
    };
  }

  private async buildSendError(
    response: Response,
    to: string | undefined,
    phoneNumberId: string,
    actionType: "send" | "edit"
  ) {
    const body = await response.text();
    const details = this.parseGraphError(body);
    const message = details.error?.message?.toLowerCase() ?? "";
    const isTokenExpired =
      response.status === 401 &&
      details.error?.code === 190 &&
      (details.error?.error_subcode === 463 ||
        message.includes("session has expired") ||
        message.includes("expired"));

    const isRecipientNotAllowed =
      details.error?.code === 131030 ||
      message.includes("not in allowed list") ||
      message.includes("lista de autorizados");

    const isUnsupportedMediaType =
      details.error?.code === 100 &&
      (message.includes("received file of type") || message.includes("param file must be"));

    const action = isTokenExpired
      ? "El token de WhatsApp/Meta expiró. Genera uno nuevo en Meta Business y actualízalo en Admin > WhatsApp o vía POST /businesses/:id/whatsapp-accounts."
      : isUnsupportedMediaType
        ? "WhatsApp no acepta ese formato de archivo. Para notas de voz desde el navegador el backend convierte WebM a OGG; si persiste, reintenta o contacta soporte."
      : isRecipientNotAllowed && to
        ? `Agrega el número ${to} en Meta Developers > WhatsApp > API Setup > lista de números de prueba (modo desarrollo).`
        : actionType === "edit"
          ? "WhatsApp solo permite editar mensajes de texto dentro de los 15 minutos posteriores al envío."
          : "Revisa el token, phone_number_id y permisos del numero en Meta antes de reintentar.";

    logger.error(
      {
        status: response.status,
        body,
        action,
        phoneNumberId,
        to,
        actionType
      },
      isTokenExpired
        ? "WhatsApp token expired while sending message"
        : actionType === "edit"
          ? "Failed to edit WhatsApp message"
          : "Failed to send WhatsApp message"
    );

    throw new WhatsAppSendError(
      isTokenExpired
        ? "No se pudo enviar el mensaje porque el token de WhatsApp expiró."
        : isUnsupportedMediaType
          ? (details.error?.message ?? "WhatsApp no acepta el formato de audio enviado.")
        : actionType === "edit"
          ? (details.error?.message ?? "No se pudo editar el mensaje en WhatsApp.")
          : `No se pudo enviar el mensaje de WhatsApp. Status ${response.status}.`,
      response.status,
      body,
      action,
      isTokenExpired
    );
  }

  private parseGraphError(body: string): GraphErrorPayload {
    try {
      return JSON.parse(body) as GraphErrorPayload;
    } catch {
      return {};
    }
  }
}
