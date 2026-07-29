import type { FlowFieldDefinition } from "./flow-definition.schema.js";
import { getNestedValue, setNestedValue } from "./flow-graph.utils.js";

export type SlotStatus =
  | "missing"
  | "inferred"
  | "captured"
  | "needs_confirmation"
  | "confirmed"
  | "rejected"
  | "corrected";

export interface FlowSlotValue {
  key: string;
  value: unknown;
  status: SlotStatus;
  confidence: number;
  sourceMessageId?: string;
  sourceType:
    | "current_message"
    | "recent_conversation"
    | "contact_profile"
    | "human"
    | "integration"
    | "ai_inference";
  updatedAt: string;
}

export interface FlowVariablesState {
  slots: Record<string, FlowSlotValue>;
  flat: Record<string, unknown>;
}

export function emptyVariablesState(): FlowVariablesState {
  return { slots: {}, flat: {} };
}

export function parseVariablesJson(raw: unknown): FlowVariablesState {
  if (!raw || typeof raw !== "object") {
    return emptyVariablesState();
  }
  const data = raw as Record<string, unknown>;
  const slots = (data.slots as Record<string, FlowSlotValue> | undefined) ?? {};
  const flat = (data.flat as Record<string, unknown> | undefined) ?? {};
  return { slots, flat };
}

export function serializeVariablesState(state: FlowVariablesState): Record<string, unknown> {
  return { slots: state.slots, flat: state.flat };
}

export function upsertSlot(
  state: FlowVariablesState,
  key: string,
  value: unknown,
  input: {
    status?: SlotStatus;
    confidence?: number;
    sourceMessageId?: string;
    sourceType?: FlowSlotValue["sourceType"];
  } = {}
): FlowVariablesState {
  const slot: FlowSlotValue = {
    key,
    value,
    status: input.status ?? "captured",
    confidence: input.confidence ?? 0.8,
    sourceType: input.sourceType ?? "current_message",
    updatedAt: new Date().toISOString(),
    ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {})
  };

  return {
    slots: { ...state.slots, [key]: slot },
    flat: setNestedValue(state.flat, key, value)
  };
}

export function getMissingRequiredFields(
  fields: FlowFieldDefinition[],
  state: FlowVariablesState
): FlowFieldDefinition[] {
  return fields.filter((field) => {
    if (!field.required) {
      return false;
    }
    const slot = state.slots[field.key];
    const flat = getNestedValue(state.flat, field.key);
    return (
      (slot?.value === undefined || slot.value === null || slot.value === "") &&
      (flat === undefined || flat === null || flat === "")
    );
  });
}

export function extractSimpleFieldsFromText(
  text: string,
  fields: FlowFieldDefinition[]
): Array<{ key: string; value: unknown }> {
  const extracted: Array<{ key: string; value: unknown }> = [];
  const lower = text.toLowerCase();

  for (const field of fields) {
    if (field.key === "product.quantity") {
      const match = lower.match(/(\d+)\s*(tabla|tablas|unidad|unidades|u\b)/i);
      if (match) {
        extracted.push({ key: field.key, value: Number(match[1]) });
      }
    }
    if (field.key === "product.wood") {
      const match = lower.match(/(raul[ií]|coig[uü]e|roble|olivo|madera)/i);
      if (match) {
        extracted.push({ key: field.key, value: match[1] });
      }
    }
    if (field.key === "engraving.type") {
      if (/logo|logotipo|imagen/i.test(lower)) {
        extracted.push({ key: field.key, value: "logo" });
      } else if (/texto|frase|nombre/i.test(lower)) {
        extracted.push({ key: field.key, value: "text" });
      }
    }
    if (field.key === "customer.name") {
      const match = text.match(/(?:soy|me llamo)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
      if (match) {
        extracted.push({ key: field.key, value: match[1] });
      }
    }
    if (field.key === "delivery.method") {
      if (/\b(retiro|retirar|pickup)\b/i.test(lower)) {
        extracted.push({ key: field.key, value: "pickup" });
      } else if (/\b(despacho|delivery|env[ií]o|enviar)\b/i.test(lower)) {
        extracted.push({ key: field.key, value: "delivery" });
      }
    }
    if (field.key === "delivery.commune") {
      const match = lower.match(/\b(?:en|para|a)\s+([a-záéíóúñ\s]{3,40})(?:\s|,|\.|$)/i);
      if (match?.[1]) {
        extracted.push({ key: field.key, value: match[1].trim() });
      }
    }
    if (field.type === "number") {
      const match = lower.match(new RegExp(`${field.label.toLowerCase()}[:\\s]+(\\d+)`, "i"));
      if (match) {
        extracted.push({ key: field.key, value: Number(match[1]) });
      }
    }
  }

  return extracted;
}

export function buildMissingFieldsPrompt(missing: FlowFieldDefinition[]): string {
  if (missing.length === 0) {
    return "Gracias, ya tengo la información necesaria.";
  }
  if (missing.length === 1) {
    return `¿Podrías indicarme ${missing[0]!.label.toLowerCase()}?`;
  }
  const labels = missing.map((f) => `• ${f.label}`).join("\n");
  return `Para continuar necesito estos datos:\n${labels}`;
}

export function buildConfirmationSummary(
  fields: FlowFieldDefinition[],
  state: FlowVariablesState
): string {
  const lines = fields
    .map((field) => {
      const value = getNestedValue(state.flat, field.key) ?? state.slots[field.key]?.value;
      if (value == null || value === "") {
        return null;
      }
      return `${field.label}: ${String(value)}`;
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return "¿Confirmas que la información es correcta?";
  }

  return `Resumen:\n${lines.join("\n")}\n\n¿Está correcto? Responde sí o no.`;
}
