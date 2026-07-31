export type WhatsappDeliveryErrorDetail = {
  code: number;
  title: string;
  message: string;
};

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
  const detail =
    first.message?.trim() ||
    first.error_data?.details?.trim() ||
    title;

  return {
    code: first.code,
    title,
    message: detail
  };
}

export function formatWhatsappDeliveryErrorMessage(error: WhatsappDeliveryErrorDetail): string {
  return `${error.title} (${error.code}): ${error.message}`;
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
