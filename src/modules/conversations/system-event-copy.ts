import type {
  SystemEventActor,
  SystemEventAppearance,
  SystemEventKind,
  SystemEventPayload
} from "./system-event.types.js";

export function systemEventActorLabel(actor: SystemEventActor): string {
  return actor === "HUMAN" ? "El asesor" : "El bot";
}

export function systemEventTitle(kind: SystemEventKind, actor: SystemEventActor): string {
  const who = systemEventActorLabel(actor);
  switch (kind) {
    case "profile_saved":
    case "profile_updated":
      return `${who} guardó un dato del contacto`;
    case "plate_lookup":
      return `${who} consultó una patente`;
    case "vehicle_identified":
      return `${who} identificó un vehículo`;
    case "fitment_check":
      return `${who} revisó compatibilidad de un repuesto`;
    case "recommendation":
    case "suggestion":
      return `${who} sugirió repuestos compatibles`;
    case "quote_prepared":
      return `${who} armó y envió una cotización PDF`;
    case "handoff":
      return actor === "HUMAN"
        ? "El asesor tomó la conversación"
        : "El bot derivó la conversación a un asesor";
    case "mode_changed":
      return actor === "HUMAN"
        ? "El asesor devolvió la conversación al bot"
        : "El bot reactivó las respuestas automáticas";
    case "mechanic_note":
      return `${who} dejó una nota de mecánica`;
  }
}

export function buildSystemEvent(
  kind: SystemEventKind,
  actor: SystemEventActor,
  body: string,
  payload?: Record<string, unknown>,
  appearance: SystemEventAppearance = "blue_pill"
): SystemEventPayload {
  const resolvedAppearance = appearance === "dark_card" ? "dark_card" : "blue_pill";
  return {
    kind,
    actor,
    appearance: resolvedAppearance,
    title:
      resolvedAppearance === "dark_card" ? "Vehículo del contacto" : systemEventTitle(kind, actor),
    body,
    payload: { actor, appearance: resolvedAppearance, ...(payload ?? {}) }
  };
}

export type VehicleCardFields = {
  plate?: string | null;
  plate_display?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  engine?: string | null;
  vehicle_type?: string | null;
  color?: string | null;
  vin?: string | null;
  fuel?: string | null;
  version?: string | null;
  transmission?: string | null;
  status?: string | null;
};

export function vehicleCardHasData(fields: VehicleCardFields): boolean {
  return Boolean(fields.make || fields.model || fields.year || fields.vin);
}

export function formatVehicleCardBody(fields: VehicleCardFields): string {
  const headline = [fields.make, fields.model, fields.year != null ? String(fields.year) : null]
    .filter(Boolean)
    .join(" ");
  const extras = [
    fields.plate_display ?? fields.plate,
    fields.version,
    fields.vehicle_type,
    fields.engine ? `motor ${fields.engine}` : null,
    fields.fuel,
    fields.transmission,
    fields.color,
    fields.vin ? `VIN ${fields.vin}` : null
  ].filter(Boolean);
  if (headline && extras.length) return `${headline} · ${extras.join(" · ")}`;
  return headline || extras.join(" · ") || "Datos del vehículo guardados.";
}

export type ProfileFieldChange = {
  field: string;
  previous: string | null;
  next: string | null;
};

const PROFILE_FIELD_LABELS: Record<string, string> = {
  display_alias: "nombre visible",
  first_name: "nombre",
  last_name: "apellido",
  email: "email",
  tax_id: "RUT",
  invoice_type: "tipo de documento",
  company_name: "razón social",
  business_activity: "giro",
  delivery1_line1: "dirección",
  delivery1_line2: "dirección (línea 2)",
  delivery1_commune: "comuna",
  delivery1_region: "región",
  delivery1_notes: "notas de entrega",
  delivery2_line1: "segunda dirección",
  delivery2_line2: "segunda dirección (línea 2)",
  delivery2_commune: "segunda comuna",
  delivery2_region: "segunda región",
  delivery2_notes: "notas de segunda entrega",
  billing_line1: "dirección de facturación",
  billing_line2: "facturación (línea 2)",
  billing_commune: "comuna de facturación",
  billing_region: "región de facturación",
  billing_notes: "notas de facturación",
  billing_same_as_delivery: "facturación igual a entrega",
  profile_metadata: "vehículos u otros datos del perfil",
  vehicle_plate: "patente",
  vin: "VIN",
  last_need: "necesidad",
  delivery_preference: "preferencia de entrega"
};

export function profileFieldLabel(field: string): string {
  return PROFILE_FIELD_LABELS[field] ?? field;
}

export function describeProfileEventFields(
  fields: string[],
  values?: Record<string, string>
): string {
  return fields
    .map((field) => {
      const label = profileFieldLabel(field);
      const value = values?.[field];
      return value ? `${label}: ${value}` : label;
    })
    .join(", ");
}

export function describeProfileChanges(changes: ProfileFieldChange[]): {
  added: string[];
  modified: string[];
  body: string;
} {
  const added: string[] = [];
  const modified: string[] = [];

  for (const change of changes) {
    const label = profileFieldLabel(change.field);
    const previous = change.previous?.trim() || "";
    const next = change.next?.trim() || "";
    if (!previous && !next) continue;
    if (!previous && next) {
      added.push(`${label}: ${next}`);
      continue;
    }
    if (previous !== next) {
      modified.push(`${label}: ${previous} -> ${next || "(vacío)"}`);
    }
  }

  const parts: string[] = [];
  if (added.length) parts.push(`se añadió: ${added.join(", ")}`);
  if (modified.length) parts.push(`se modificó: ${modified.join(", ")}`);
  return { added, modified, body: parts.join(". ") };
}

export function describeGarageRemovalEvent(removed: string[]): {
  removed: string[];
  added: [];
  modified: [];
  body: string;
} {
  return {
    removed,
    added: [],
    modified: [],
    body: removed.length ? `se eliminó: ${removed.join(", ")}` : ""
  };
}
