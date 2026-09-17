function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function parseToneCommonPhrases(configJson: unknown): string[] {
  if (!configJson || typeof configJson !== "object" || Array.isArray(configJson)) {
    return [];
  }
  return asStringArray((configJson as Record<string, unknown>).toneCommonPhrases);
}

export function buildRuntimeSystemPrompt(input: {
  businessName: string;
  botName: string;
  botTone: string;
  knowledge: string;
  commonPhrases?: string[];
  toneRules?: Record<string, unknown>;
  greetingStyleHint?: string;
  customerMemory?: string;
}) {
  const phrases = input.commonPhrases?.length
    ? `Puedes usar expresiones como: ${input.commonPhrases.join(", ")}.`
    : "";
  const rules = input.toneRules ?? {};
  const styleHints: string[] = [];
  if (rules.use_emojis === false || rules.use_emojis === "none") {
    styleHints.push("No uses emojis.");
  } else if (
    rules.use_emojis === true ||
    rules.use_emojis === "moderate" ||
    rules.use_emojis === "high"
  ) {
    styleHints.push("Puedes usar emojis con moderación si encajan con el tono del negocio.");
  }
  if (rules.response_length === "short") {
    styleHints.push("Responde en 1-2 frases cortas.");
  } else if (rules.response_length === "medium") {
    styleHints.push("Responde de forma balanceada: clara y sin extenderte de más.");
  } else if (rules.response_length === "long") {
    styleHints.push("Puedes dar respuestas más detalladas cuando sea necesario.");
  }
  if (rules.offer_next_step === false) {
    styleHints.push("No cierres con preguntas ni llamados a la acción innecesarios.");
  } else if (rules.offer_next_step === true) {
    styleHints.push("Cuando ayude, ofrece un siguiente paso concreto (agendar, ver precios, escribir de nuevo, etc.).");
  }
  if (rules.avoid_long_explanations === true) {
    styleHints.push("Evita explicaciones largas.");
  }
  if (input.greetingStyleHint) {
    styleHints.push(input.greetingStyleHint);
  }

  const customerBlock = input.customerMemory?.trim()
    ? `DATOS DEL CLIENTE (no los contradigas; no pidas de nuevo un dato ya conocido):\n${input.customerMemory.trim()}`
    : "";

  return `
Eres ${input.botName}, asistente del negocio ${input.businessName}.
Responde solamente usando la información entregada en CONTEXTO CONFIABLE y DATOS DEL CLIENTE.
Usa el historial de la conversación para resolver referencias ("ese", "la misma", "lo de siempre") y recordar pedidos, alergias, pagos y preferencias.
No inventes precios, stock, políticas ni disponibilidad.
No afirmes que una pieza calza en un vehículo si eso no está en el contexto.
Si el cliente hace varias preguntas en un mismo mensaje, respóndelas todas, punto por punto, con SKU y precio cuando estén en el contexto.
Si no hay el producto exacto, ofrece 1 o 2 alternativas de la misma categoría que sí estén en el contexto y pide el dato que falta (SKU, viscosidad, marca/modelo/año o una foto).
No prometas cosas que no estén en el contexto.
No respondas temas fuera del negocio.
No anuncies que derivarás a un asesor salvo que el cliente pida una persona, reclame, pida garantía/devolución o entregue datos de tarjeta.
Si falta información, pregunta de forma concreta. No te rindas a la primera.
Si el cliente pide cotización y ya hay productos con precio en el contexto, confirma SKU, cantidad y total, y ofrece armar la cotización en PDF. Pregunta si prefiere retiro o despacho.
Mantén un tono ${input.botTone}, cercano, claro y profesional.
${phrases}
${styleHints.join(" ")}
Responde siempre en español.

${customerBlock}

CONTEXTO CONFIABLE:
${input.knowledge || "Sin contexto suficiente."}
  `.replace(/\n{3,}/g, "\n\n").trim();
}

export const INTENT_HINTS = {
  wantsHuman: ["humano", "persona", "asesor", "agente", "ejecutivo", "vendedor", "hablar con alguien"],
  complaint: [
    "reclamo",
    "queja",
    "molesto",
    "enojado",
    "pesimo",
    "pésimo",
    "mal servicio",
    "que mal",
    "qué mal",
    "no sirven",
    "horrible",
    "inaceptable",
    "una vergüenza",
    "pésima atención",
    "peor servicio",
    "estafa"
  ],
  warranty: ["garantia", "garantía", "devolucion", "devolución", "reembolso"],
  specialQuote: ["cotizacion especial", "cotización especial", "presupuesto especial", "mayorista", "por volumen"],
  sensitive: ["datos personales", "rut", "contraseña", "password", "tarjeta", "cuenta bancaria"]
} as const;

export type HandoffReason =
  | "user_requested_human"
  | "low_rag_confidence"
  | "complaint"
  | "customer_frustrated"
  | "repeated_failure"
  | "warranty_return"
  | "special_quote"
  | "sensitive_topic"
  | "insufficient_context"
  | "ai_uncertain";

export function detectHandoffReason(text: string): HandoffReason | null {
  const normalized = text.toLowerCase();
  if (INTENT_HINTS.wantsHuman.some((t) => normalized.includes(t))) return "user_requested_human";
  if (INTENT_HINTS.complaint.some((t) => normalized.includes(t))) return "complaint";
  if (INTENT_HINTS.warranty.some((t) => normalized.includes(t))) return "warranty_return";
  if (INTENT_HINTS.specialQuote.some((t) => normalized.includes(t))) return "special_quote";
  if (hasSensitiveTopic(normalized)) return "sensitive_topic";
  return null;
}

function hasSensitiveTopic(normalized: string): boolean {
  if (normalized.includes("datos personales")) return true;
  if (normalized.includes("contraseña") || normalized.includes("password")) return true;
  if (normalized.includes("cuenta bancaria")) return true;
  if (/\btarjeta\b/.test(normalized) && /\b(\d{4}|cvv|cvc|clave)\b/.test(normalized)) {
    return true;
  }
  return /\brut\b/.test(normalized);
}

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  user_requested_human: "Cliente solicitó hablar con un humano",
  low_rag_confidence: "Confianza RAG insuficiente",
  complaint: "Reclamo o cliente molesto",
  customer_frustrated: "Cliente muestra frustración o molestia",
  repeated_failure: "El bot no pudo resolver tras varios intentos",
  warranty_return: "Garantía o devolución",
  special_quote: "Cotización especial",
  sensitive_topic: "Pregunta sensible",
  insufficient_context: "Sin contexto suficiente",
  ai_uncertain: "IA sin certeza para responder"
};
