import type { HandoffReason } from "./prompts.js";

export function resolveHandoffCustomerMessage(input: {
  reason: HandoffReason;
  businessName: string;
  defaultHandoffMessage: string;
}): string {
  const { reason, businessName, defaultHandoffMessage } = input;

  switch (reason) {
    case "user_requested_human":
      return `Claro, te conecto con un asesor de ${businessName} ahora mismo.`;
    case "complaint":
    case "customer_frustrated":
      return "Entiendo tu molestia. Un asesor te atenderá personalmente en breve.";
    case "low_rag_confidence":
    case "insufficient_context":
      return `No tengo ese dato confirmado. Te paso con alguien del equipo de ${businessName} que te puede ayudar.`;
    case "repeated_failure":
      return "Veo que no te he podido ayudar bien. Te conecto con un asesor.";
    case "ai_uncertain":
      return "Prefiero que un asesor te confirme esto. Te contactamos enseguida.";
    case "warranty_return":
    case "special_quote":
    case "sensitive_topic":
      return defaultHandoffMessage;
    default:
      return defaultHandoffMessage;
  }
}
