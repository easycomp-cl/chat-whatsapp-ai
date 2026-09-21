export const SYSTEM_EVENT_KINDS = [
  "profile_saved",
  "profile_updated",
  "handoff",
  "mode_changed",
  "plate_lookup",
  "vehicle_identified",
  "fitment_check",
  "recommendation",
  "suggestion",
  "quote_prepared",
  "mechanic_note"
] as const;

export type SystemEventKind = (typeof SYSTEM_EVENT_KINDS)[number];
export type SystemEventActor = "BOT" | "HUMAN";
export const SYSTEM_EVENT_APPEARANCES = ["blue_pill", "dark_card"] as const;
export type SystemEventAppearance = (typeof SYSTEM_EVENT_APPEARANCES)[number];

export type SystemEventPayload = {
  kind: SystemEventKind;
  actor: SystemEventActor;
  appearance: SystemEventAppearance;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

export function isSystemEventKind(value: unknown): value is SystemEventKind {
  return typeof value === "string" && (SYSTEM_EVENT_KINDS as readonly string[]).includes(value);
}

export function readStoredSystemEvent(rawPayloadJson: unknown): SystemEventPayload | null {
  if (!rawPayloadJson || typeof rawPayloadJson !== "object" || Array.isArray(rawPayloadJson)) {
    return null;
  }
  const event = (rawPayloadJson as { system_event?: unknown }).system_event;
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return null;
  }
  const row = event as Record<string, unknown>;
  if (!isSystemEventKind(row.kind) || typeof row.title !== "string" || typeof row.body !== "string") {
    return null;
  }
  return {
    kind: row.kind,
    actor: row.actor === "HUMAN" ? "HUMAN" : "BOT",
    appearance: row.appearance === "dark_card" ? "dark_card" : "blue_pill",
    title: row.title,
    body: row.body,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {}
  };
}
