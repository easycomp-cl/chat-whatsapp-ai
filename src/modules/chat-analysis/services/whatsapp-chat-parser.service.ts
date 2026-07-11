import type { ParsedChatMessage } from "../types/parsed-chat-message.type.js";

const INVISIBLE_CHARS = /[\u200E\u200F\uFEFF]/g;
const UNICODE_SPACES = /[\u202F\u00A0]/g;

const SYSTEM_MESSAGE_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /changed their phone number/i,
  /^[\s\u200E\u200F\uFEFF]*(?:image|sticker|video|audio|document|gif|contact card) omitted/i,
  /los mensajes y llamadas están cifrados/i,
  /los mensajes y las llamadas están cifrados/i,
  /se eliminó este mensaje/i,
  /se elimino este mensaje/i,
  /^[\s\u200E\u200F\uFEFF]*(?:imagen|sticker|video|audio|documento|gif|contacto).*(?:omitid[oa]|omitted)/i,
  /archivo adjunto/i,
  /cambió el código de seguridad/i,
  /cambio el codigo de seguridad/i,
  /creó el grupo/i,
  /creo el grupo/i,
  /añadió a/i,
  /anadio a/i,
  /salió del grupo/i,
  /salio del grupo/i,
  /<multimedia omitido>/i
];

/** Android: 12/05/2026, 10:42 - Nombre: mensaje */
const MESSAGE_HEADER_REGEX =
  /^(?:\[)?(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)\s*(?:\])?\s*[-–]\s*(.+?):\s(.*)$/i;

/** iOS / exportación reciente: [22-12-23, 20:25:45] Nombre: mensaje */
const MESSAGE_HEADER_BRACKET_REGEX =
  /^\[(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)\]\s*(.+?):\s(.*)$/i;

function normalizeLine(line: string): string {
  return line
    .trimEnd()
    .replace(INVISIBLE_CHARS, "")
    .replace(UNICODE_SPACES, " ");
}

function cleanMessageText(text: string): string {
  return text
    .replace(INVISIBLE_CHARS, "")
    .replace(UNICODE_SPACES, " ")
    .replace(
      /\s*(?:imagen|audio|video|sticker|documento|gif) omitid[oa]\s*$/i,
      ""
    )
    .trim();
}

function parseDateTime(dateStr: string, timeStr: string): Date | undefined {
  const dateParts = dateStr.split(/[-\/]/).map((p) => parseInt(p, 10));
  if (dateParts.length !== 3) {
    return undefined;
  }
  const day = dateParts[0];
  const month = dateParts[1];
  let year = dateParts[2];
  if (day === undefined || month === undefined || year === undefined) {
    return undefined;
  }
  if (year < 100) {
    year += 2000;
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m\.?/i);
  if (ampmMatch) {
    hours = parseInt(ampmMatch[1] ?? "0", 10);
    minutes = parseInt(ampmMatch[2] ?? "0", 10);
    seconds = parseInt(ampmMatch[3] ?? "0", 10);
    const meridiem = (ampmMatch[4] ?? "").toLowerCase();
    if (meridiem === "p" && hours < 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  } else {
    const parts = timeStr.split(":").map((p) => parseInt(p.replace(/\D/g, ""), 10));
    hours = parts[0] ?? 0;
    minutes = parts[1] ?? 0;
    seconds = parts[2] ?? 0;
  }

  const d = new Date(year, month - 1, day, hours, minutes, seconds);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function isSystemMessage(text: string): boolean {
  return SYSTEM_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

function tryParseHeader(line: string): ParsedChatMessage | null {
  const normalized = normalizeLine(line);
  const match =
    normalized.match(MESSAGE_HEADER_REGEX) ??
    normalized.match(MESSAGE_HEADER_BRACKET_REGEX);
  if (!match) {
    return null;
  }

  const [, date, time, sender, message] = match;
  if (!date || !time || !sender || message === undefined) {
    return null;
  }

  const trimmedMessage = cleanMessageText(message);
  if (!trimmedMessage || isSystemMessage(trimmedMessage)) {
    return null;
  }

  const messageAt = parseDateTime(date, time);
  const parsed: ParsedChatMessage = {
    date,
    time,
    sender: sender.trim(),
    message: trimmedMessage
  };
  if (messageAt) {
    parsed.messageAt = messageAt;
  }
  return parsed;
}

export class WhatsappChatParserService {
  parse(content: string): ParsedChatMessage[] {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const messages: ParsedChatMessage[] = [];
    let current: ParsedChatMessage | null = null;

    for (const rawLine of lines) {
      const line = normalizeLine(rawLine);
      if (!line.trim()) {
        continue;
      }

      const parsed = tryParseHeader(line);
      if (parsed) {
        if (current) {
          messages.push(current);
        }
        current = parsed;
        continue;
      }

      if (current) {
        current.message = cleanMessageText(`${current.message}\n${line.trim()}`);
      }
    }

    if (current) {
      messages.push(current);
    }

    return messages.filter((m) => !isSystemMessage(m.message));
  }
}

export const whatsappChatParserService = new WhatsappChatParserService();
