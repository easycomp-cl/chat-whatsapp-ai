import { z } from "zod";

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

export const INTERACTIVE_MAX_BUTTONS = 3;
export const INTERACTIVE_MAX_LIST_ROWS = 10;
export const INTERACTIVE_MAX_BUTTON_TITLE = 20;
export const INTERACTIVE_MAX_LIST_ROW_TITLE = 24;
export const INTERACTIVE_MAX_LIST_ROW_DESCRIPTION = 72;
export const INTERACTIVE_MAX_LIST_BUTTON_TEXT = 20;
export const INTERACTIVE_MAX_BODY = 1024;

const MAX_BUTTONS = INTERACTIVE_MAX_BUTTONS;
const MAX_LIST_ROWS = INTERACTIVE_MAX_LIST_ROWS;
const MAX_BUTTON_TITLE = INTERACTIVE_MAX_BUTTON_TITLE;
const MAX_LIST_ROW_TITLE = INTERACTIVE_MAX_LIST_ROW_TITLE;
const MAX_LIST_ROW_DESCRIPTION = INTERACTIVE_MAX_LIST_ROW_DESCRIPTION;
const MAX_LIST_BUTTON_TEXT = INTERACTIVE_MAX_LIST_BUTTON_TEXT;
const MAX_BODY = INTERACTIVE_MAX_BODY;

const interactiveButtonOptionSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(MAX_BUTTON_TITLE)
});

const interactiveListRowSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(MAX_LIST_ROW_TITLE),
  description: z.string().max(MAX_LIST_ROW_DESCRIPTION).optional()
});

const interactiveListSectionSchema = z.object({
  title: z.string().optional(),
  rows: z.array(interactiveListRowSchema).min(1).max(MAX_LIST_ROWS)
});

export const outboundInteractiveSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("button"),
    body: z.string().min(1).max(MAX_BODY),
    buttons: z.array(interactiveButtonOptionSchema).min(1).max(MAX_BUTTONS)
  }),
  z.object({
    type: z.literal("list"),
    body: z.string().min(1).max(MAX_BODY),
    buttonText: z.string().min(1).max(MAX_LIST_BUTTON_TEXT),
    sections: z.array(interactiveListSectionSchema).min(1)
  })
]).superRefine((interactive, ctx) => {
  if (interactive.type !== "list") {
    return;
  }

  const totalRows = interactive.sections.reduce((sum, section) => sum + section.rows.length, 0);
  if (totalRows < 1 || totalRows > MAX_LIST_ROWS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `La lista debe tener entre 1 y ${MAX_LIST_ROWS} filas en total`,
      path: ["sections"]
    });
  }
});

export const sendInteractiveMessageSchema = z.object({
  interactive: outboundInteractiveSchema,
  agent_phone: z.string().optional(),
  reply_to_message_id: z.string().optional()
});

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
