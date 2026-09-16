export type WhatsappDeliveryErrorDetail = {
  code: number;
  title: string;
  message: string;
};

export type WhatsappDeliveryErrorKind =
  | "billing_currency"
  | "billing_payment_method"
  | "billing_insufficient_funds"
  | "billing"
  | "reengagement_window"
  | "undeliverable"
  | "rate_limited"
  | "other";

type MetaStatusErrorRow = {
  code?: number | undefined;
  title?: string | undefined;
  message?: string | undefined;
  error_data?: {
    details?: string | undefined;
  } | undefined;
};

export function parseWhatsappDeliveryErrors(
  errors: MetaStatusErrorRow[] | undefined
): WhatsappDeliveryErrorDetail | null {
  const first = errors?.[0];
  if (!first || typeof first.code !== "number") {
    return null;
  }

  const title = first.title?.trim() || "Error de entrega";
  const details = first.error_data?.details?.trim();
  const shortMessage = first.message?.trim();
  const detail = details || shortMessage || title;

  return {
    code: first.code,
    title,
    message: detail
  };
}

export function classifyWhatsappDeliveryError(
  code: number | null | undefined,
  text = ""
): WhatsappDeliveryErrorKind | null {
  if (code == null) return null;

  const haystack = text.toLowerCase();

  if (code === 131042) {
    if (
      /currency|moneda|pa[ií]s|country_currency|change_country_currency/.test(haystack)
    ) {
      return "billing_currency";
    }
    if (
      /insufficient|saldo|funds|balance|credit|prepaid/.test(haystack)
    ) {
      return "billing_insufficient_funds";
    }
    if (
      /payment method|m[eé]todo de pago|no payment|add a payment|billing_hub/.test(
        haystack
      )
    ) {
      return "billing_payment_method";
    }
    return "billing";
  }

  if (code === 131047) return "reengagement_window";
  if (code === 131026) return "undeliverable";
  if (code === 130429 || code === 131048) return "rate_limited";
  return "other";
}

export function userFacingWhatsappDeliveryErrorMessage(
  error: Pick<WhatsappDeliveryErrorDetail, "code" | "title" | "message">
): string {
  const kind = classifyWhatsappDeliveryError(
    error.code,
    `${error.title} ${error.message}`
  );

  switch (kind) {
    case "billing_currency":
      return "No se pudo enviar la plantilla: la cuenta de WhatsApp Business no tiene país o moneda de facturación configurada en Meta.";
    case "billing_payment_method":
      return "No se pudo enviar la plantilla: no hay un método de pago registrado en la cuenta de WhatsApp Business.";
    case "billing_insufficient_funds":
      return "No se pudo enviar la plantilla: saldo insuficiente o el método de pago de Meta fue rechazado.";
    case "billing":
      return "No se pudo enviar la plantilla: hay un problema de pago o facturación en la cuenta de WhatsApp Business.";
    case "reengagement_window":
      return "No se pudo enviar: pasaron más de 24 horas desde el último mensaje del cliente. Usa una plantilla aprobada.";
    case "undeliverable":
      return "No se pudo entregar: el número no tiene WhatsApp o no puede recibir este mensaje.";
    case "rate_limited":
      return "WhatsApp limitó el envío por volumen. Reintenta en unos minutos.";
    default:
      return `No se pudo entregar el mensaje de WhatsApp (${error.code}).`;
  }
}

export function formatWhatsappDeliveryErrorMessage(
  error: WhatsappDeliveryErrorDetail
): string {
  return userFacingWhatsappDeliveryErrorMessage(error);
}

export function parseGraphApiErrorBody(body: string): {
  code?: number;
  message: string;
} {
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: number; message?: string };
    };
    const message = parsed.error?.message?.trim();
    if (!message) {
      return { message: "Error desconocido al enviar por WhatsApp" };
    }

    return {
      ...(typeof parsed.error?.code === "number" ? { code: parsed.error.code } : {}),
      message
    };
  } catch {
    return { message: body.trim() || "Error desconocido al enviar por WhatsApp" };
  }
}
