export type InteractiveButtonOption = {
  id: string;
  title: string;
};

export type InteractiveListRow = {
  id: string;
  title: string;
  description?: string;
};

export type InteractiveListSection = {
  title?: string;
  rows: InteractiveListRow[];
};

export type OutboundInteractiveButtons = {
  type: "button";
  body: string;
  buttons: InteractiveButtonOption[];
};

export type OutboundInteractiveList = {
  type: "list";
  body: string;
  buttonText: string;
  sections: InteractiveListSection[];
};

export type OutboundInteractiveMessage = OutboundInteractiveButtons | OutboundInteractiveList;

export type StoredOutboundInteractive = OutboundInteractiveMessage;

const MAX_BUTTONS = 3;
const MAX_LIST_ROWS = 10;
const MAX_BUTTON_TITLE = 20;
const MAX_LIST_ROW_TITLE = 24;
const MAX_LIST_ROW_DESCRIPTION = 72;
const MAX_LIST_BUTTON_TEXT = 20;
const MAX_BODY = 1024;

export function truncateInteractiveText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

export function slugInteractiveId(value: string, index: number): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);

  return normalized || `option_${index + 1}`;
}

export function buildChoiceInteractiveMessage(input: {
  body: string;
  options: Array<{ label?: string; value?: string }>;
}): OutboundInteractiveMessage | null {
  const body = truncateInteractiveText(input.body.trim() || "Elige una opción:", MAX_BODY);
  const normalizedOptions = input.options
    .map((option, index) => {
      const label = (option.label ?? option.value ?? `Opción ${index + 1}`).trim();
      const value = (option.value ?? option.label ?? label).trim();
      if (!label || !value) {
        return null;
      }

      return {
        id: slugInteractiveId(value, index),
        title: truncateInteractiveText(label, MAX_BUTTON_TITLE),
        value
      };
    })
    .filter((option): option is { id: string; title: string; value: string } => option !== null);

  if (normalizedOptions.length === 0) {
    return null;
  }

  if (normalizedOptions.length <= MAX_BUTTONS) {
    return {
      type: "button",
      body,
      buttons: normalizedOptions.map((option) => ({
        id: option.id,
        title: option.title
      }))
    };
  }

  if (normalizedOptions.length > MAX_LIST_ROWS) {
    return null;
  }

  return {
    type: "list",
    body,
    buttonText: truncateInteractiveText("Ver opciones", MAX_LIST_BUTTON_TEXT),
    sections: [
      {
        title: "Opciones",
        rows: normalizedOptions.map((option) => ({
          id: option.id,
          title: truncateInteractiveText(option.title, MAX_LIST_ROW_TITLE),
          description: truncateInteractiveText(option.value, MAX_LIST_ROW_DESCRIPTION)
        }))
      }
    ]
  };
}

export function readStoredOutboundInteractive(rawPayloadJson: unknown): StoredOutboundInteractive | null {
  if (!rawPayloadJson || typeof rawPayloadJson !== "object") {
    return null;
  }

  const interactive = (rawPayloadJson as { outbound?: { interactive?: unknown } }).outbound?.interactive;
  if (!interactive || typeof interactive !== "object") {
    return null;
  }

  const payload = interactive as OutboundInteractiveMessage;
  if (payload.type === "button" && Array.isArray(payload.buttons)) {
    return payload;
  }

  if (payload.type === "list" && Array.isArray(payload.sections)) {
    return payload;
  }

  return null;
}

export function summarizeOutboundInteractive(interactive: StoredOutboundInteractive): string {
  if (interactive.type === "button") {
    const labels = interactive.buttons.map((button) => button.title).join(" · ");
    return labels ? `${interactive.body}\n[${labels}]` : interactive.body;
  }

  const rows = interactive.sections.flatMap((section) => section.rows.map((row) => row.title));
  const labels = rows.join(" · ");
  return labels ? `${interactive.body}\n[${labels}]` : interactive.body;
}
