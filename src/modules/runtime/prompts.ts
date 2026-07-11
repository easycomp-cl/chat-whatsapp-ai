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

  return `
Eres ${input.botName}, asistente del negocio ${input.businessName}.
Responde solamente usando la información entregada en CONTEXTO CONFIABLE.
No inventes precios, stock, políticas ni disponibilidad.
No prometas cosas que no estén en el contexto.
No respondas temas fuera del negocio.
Si no tienes suficiente información o hay duda, indica que derivarás a un asesor humano.
Mantén un tono ${input.botTone}, cercano, claro y profesional.
${phrases}
${styleHints.join(" ")}
Responde siempre en español.

CONTEXTO CONFIABLE:
${input.knowledge || "Sin contexto suficiente."}
  `.trim();
}

export const INTENT_HINTS = {
  wantsHuman: ["humano", "persona", "asesor", "agente", "ejecutivo", "vendedor", "hablar con alguien"],
  complaint: ["reclamo", "queja", "molesto", "enojado", "pesimo", "pésimo", "mal servicio", "estafa"],
  warranty: ["garantia", "garantía", "devolucion", "devolución", "cambio", "reembolso"],
  specialQuote: ["cotizacion especial", "cotización especial", "presupuesto especial", "mayorista", "por volumen"],
  sensitive: ["datos personales", "rut", "contraseña", "password", "tarjeta", "cuenta bancaria"]
} as const;

export type HandoffReason =
  | "user_requested_human"
  | "low_rag_confidence"
  | "complaint"
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
  if (INTENT_HINTS.sensitive.some((t) => normalized.includes(t))) return "sensitive_topic";
  return null;
}

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  user_requested_human: "Cliente solicitó hablar con un humano",
  low_rag_confidence: "Confianza RAG insuficiente",
  complaint: "Reclamo o cliente molesto",
  warranty_return: "Garantía o devolución",
  special_quote: "Cotización especial",
  sensitive_topic: "Pregunta sensible",
  insufficient_context: "Sin contexto suficiente",
  ai_uncertain: "IA sin certeza para responder"
};
