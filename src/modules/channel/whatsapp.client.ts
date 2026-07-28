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
      throw this.buildSendError(response, params.to, params.phoneNumberId, "send");
    }

    const json = (await response.json()) as SendMessageResponse;
    return json.messages?.[0]?.id ?? null;
  }

  async editTextMessage(params: EditWhatsAppTextParams): Promise<void> {
    const endpoint = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${params.phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
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
      throw this.buildSendError(response, undefined, params.phoneNumberId, "edit");
    }
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

    const action = isTokenExpired
      ? "El token de WhatsApp/Meta expiró. Genera uno nuevo en Meta Business y actualízalo en Admin > WhatsApp o vía POST /businesses/:id/whatsapp-accounts."
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
        : actionType === "edit"
          ? "No se pudo editar el mensaje en WhatsApp."
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
