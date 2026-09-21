import { extractDeliveryFromText } from "../quotes/product-quote.utils.js";
import { looksLikeVehicleQuery } from "../vehicles/mechanic-agent.service.js";
import { readCustomerGarage, type CustomerGarage } from "../customers/customer-garage.js";
import { resolveVehiclesFromText } from "../vehicles/vehicle-catalog.js";
import { extractChileanPlates } from "../../utils/chilean-plate.js";
import { extractVehicleVins } from "../vehicles/vehicle-vin.client.js";

export type QualificationSlot = "name" | "need" | "vehicle" | "delivery_preference";

export type QualificationKnown = {
  name: string | null;
  need: string | null;
  vehicle: string | null;
  delivery_preference: "pickup" | "delivery" | null;
};

export type QualificationState = {
  mechanicMode: boolean;
  vehicleIdentified: boolean;
  fitmentReady: boolean;
  known: QualificationKnown;
  missing: QualificationSlot[];
  nextAsk: QualificationSlot | null;
  promptBlock: string;
};

const NEED_RE =
  /\b(?:necesito|busco|quiero|me falta|requiero|ándame|andame|pásame|pasame|cotizar|cotizaci[oó]n)\b/i;

const PARTS_NEED_RE =
  /\b(filtro|pastillas?|buj[ií]as?|ampolletas?|escobillas?|aceite|repuesto|freno|embrague|correa|bater[ií]a|neum[aá]tico|llanta)\b/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function trimOptional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function looksLikePhoneLabel(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && /^[\d\s+\-()]+$/.test(value.trim());
}

export function resolveKnownPersonName(input: {
  displayAlias?: string | null | undefined;
  name?: string | null | undefined;
  firstName?: string | null | undefined;
}): string | null {
  const alias = trimOptional(input.displayAlias);
  if (alias && !looksLikePhoneLabel(alias)) return alias;
  const first = trimOptional(input.firstName);
  if (first && !looksLikePhoneLabel(first)) return first;
  const name = trimOptional(input.name);
  if (name && !looksLikePhoneLabel(name)) return name;
  return null;
}

export function extractNeedFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!NEED_RE.test(trimmed) && !PARTS_NEED_RE.test(trimmed)) return null;

  const match = trimmed.match(
    /(?:necesito|busco|quiero|me falta|requiero)\s+([^?\n.]{3,80})/i
  );
  if (match?.[1]) {
    const need = match[1].replace(/\s+/g, " ").trim();
    if (need.length >= 3) return need.slice(0, 120);
  }
  if (PARTS_NEED_RE.test(trimmed) || looksLikeVehicleQuery(trimmed)) {
    return trimmed.slice(0, 120);
  }
  return null;
}

export function hasVehicleIdentity(input: {
  garage: CustomerGarage;
  incomingText: string;
}): boolean {
  if (input.garage.vehicles.some((v) => v.plate || v.vin || (v.make && v.model))) {
    return true;
  }
  if (extractChileanPlates(input.incomingText).length > 0) return true;
  if (extractVehicleVins(input.incomingText).length > 0) return true;
  return resolveVehiclesFromText(input.incomingText).length > 0;
}

function formatVehicleKnown(garage: CustomerGarage): string | null {
  const active =
    garage.vehicles.find((item) => item.key === garage.active_vehicle_key) ?? garage.vehicles[0];
  if (!active) return null;
  const label = [active.make, active.model, active.year, active.plate].filter(Boolean).join(" ");
  return label || active.plate || active.vin || null;
}

function askCopy(slot: QualificationSlot): string {
  switch (slot) {
    case "name":
      return 'Pregunta el nombre de forma breve y cordial (ej: "¿Me dices tu nombre?").';
    case "need":
      return "Pregunta en qué puedes ayudar (repuesto, cotización, etc.).";
    case "vehicle":
      return 'PRIORIDAD: pide la patente de forma cordial y lúdica (ej: "¿Me pasas la patente? Con eso ubico al tiro lo que calza en tu auto 🚗"). Si no la tiene, pide marca, modelo y año. PROHIBIDO listar SKUs, precios o afirmar compatibilidad hasta tener patente o marca/modelo/año.';
    case "delivery_preference":
      return "Ofrece armar cotización en PDF y pregunta si prefiere retiro en local o despacho. Si elige despacho, pide la comuna.";
  }
}

export function buildQualificationState(input: {
  displayAlias?: string | null | undefined;
  whatsappName?: string | null | undefined;
  profileMetadata?: unknown;
  incomingText: string;
  mechanicEnabled: boolean;
  fitmentReady?: boolean;
}): QualificationState {
  const garage = readCustomerGarage(input.profileMetadata);
  const meta = asRecord(input.profileMetadata);
  const storedNeed = trimOptional(meta.last_need);
  const mechanicMode =
    input.mechanicEnabled &&
    (looksLikeVehicleQuery(input.incomingText) ||
      garage.vehicles.length > 0 ||
      Boolean(storedNeed && PARTS_NEED_RE.test(storedNeed)));

  const name = resolveKnownPersonName({
    displayAlias: input.displayAlias,
    name: input.whatsappName,
    firstName: garage.first_name
  });
  const needFromText = extractNeedFromText(input.incomingText);
  const need = needFromText ?? storedNeed;
  const vehicleIdentified = hasVehicleIdentity({
    garage,
    incomingText: input.incomingText
  });
  const vehicle = formatVehicleKnown(garage);
  const deliveryFromText = extractDeliveryFromText(input.incomingText);
  const storedDelivery = trimOptional(meta.delivery_preference);
  const delivery_preference =
    deliveryFromText.method === "pickup" || deliveryFromText.method === "delivery"
      ? deliveryFromText.method
      : storedDelivery === "pickup" || storedDelivery === "delivery"
        ? storedDelivery
        : null;

  const fitmentReady = Boolean(input.fitmentReady && vehicleIdentified);

  const missing: QualificationSlot[] = [];
  if (!name) missing.push("name");
  if (!need && (mechanicMode || !name)) missing.push("need");
  if (mechanicMode && !vehicleIdentified) missing.push("vehicle");
  if (fitmentReady && !delivery_preference) missing.push("delivery_preference");

  const nextAsk = missing[0] ?? null;

  const known: QualificationKnown = {
    name,
    need,
    vehicle: vehicleIdentified ? vehicle ?? "identificado en el mensaje" : null,
    delivery_preference
  };

  const lines: string[] = [
    "EMBUDO DE CALIFICACIÓN (obligatorio, anti-alucinación):",
    "- Fuentes de verdad, en este orden: DATOS DEL CLIENTE → CONTEXTO VEHÍCULO → CONTEXTO CONFIABLE. Si un dato no está ahí, no lo inventes.",
    "- No inventes precios, stock, SKU, políticas, compatibilidad ni disponibilidad.",
    "- No listes productos/SKU/precios de repuestos hasta que el vehículo esté identificado (patente o marca/modelo/año) o el CONTEXTO VEHÍCULO confirme fitment.",
    "- Si el cliente entrega un dato nuevo (nombre, patente, RUT, email, dirección), asúmelo guardado y no lo vuelvas a pedir.",
    "- Haz UNA pregunta prioritaria por turno (puedes saludar + esa pregunta). Sé cordial y breve."
  ];

  if (known.name || known.need || known.vehicle || known.delivery_preference) {
    lines.push("Ya conocido:");
    if (known.name) lines.push(`- Nombre: ${known.name}`);
    if (known.need) lines.push(`- Necesidad: ${known.need}`);
    if (known.vehicle) lines.push(`- Vehículo: ${known.vehicle}`);
    if (known.delivery_preference) {
      lines.push(
        `- Entrega: ${known.delivery_preference === "pickup" ? "retiro" : "despacho"}`
      );
    }
  }

  if (missing.length) {
    lines.push(`Falta por obtener (en orden): ${missing.join(" → ")}.`);
    if (nextAsk === "name" && missing.includes("vehicle")) {
      lines.push(
        'Pregunta ahora: en UNA sola frase pide el nombre y la patente de forma cordial (ej: "¿Me dices tu nombre y la patente? Con eso ubico al tiro lo que calza 🚗"). Si no tiene patente, marca/modelo/año. PROHIBIDO listar SKUs.'
      );
    } else if (nextAsk) {
      lines.push(`Pregunta ahora: ${askCopy(nextAsk)}`);
    }
  } else if (fitmentReady) {
    lines.push(
      "Datos clave completos. Confirma el repuesto compatible del CONTEXTO VEHÍCULO, ofrece cotización PDF y retiro/despacho si aún no se resolvió."
    );
  } else if (mechanicMode && vehicleIdentified) {
    lines.push(
      "Vehículo identificado. Usa solo fitment/stock del CONTEXTO VEHÍCULO y CONTEXTO CONFIABLE. Ofrece cotización PDF cuando haya productos con precio."
    );
  }

  return {
    mechanicMode,
    vehicleIdentified,
    fitmentReady,
    known,
    missing,
    nextAsk,
    promptBlock: lines.join("\n")
  };
}

export function buildQualificationGreeting(input: {
  saludo: string;
  hasName: boolean;
  isReturning: boolean;
  name?: string | null;
}): string {
  if (input.isReturning && input.hasName && input.name) {
    return `${input.saludo} ¿En qué te puedo ayudar hoy, ${input.name}?`;
  }
  if (!input.hasName) {
    return `${input.saludo} ¿Me dices tu nombre y en qué te puedo ayudar?`;
  }
  return `${input.saludo} ¿En qué te puedo ayudar hoy?`;
}
