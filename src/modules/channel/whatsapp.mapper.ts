import { whatsappWebhookSchema } from "./whatsapp.schemas.js";
import { extractEditedMessageText } from "./extract-edited-message-text.js";
import type {
  NormalizedIncomingMessage,
  NormalizedIncomingReaction,
  NormalizedIncomingEdit,
  NormalizedIncomingRevoke,
  NormalizedWebhookEvent
} from "../../types/whatsapp.js";

export function normalizeWebhookEvents(payload: unknown): NormalizedWebhookEvent[] {
  const parsed = whatsappWebhookSchema.parse(payload);
  const normalized: NormalizedWebhookEvent[] = [];

  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      if (!value.messages?.length) {
        continue;
      }

      const fromName = value.contacts?.[0]?.profile?.name;
      const toPhoneDisplay = value.metadata?.display_phone_number;
      const toPhoneNumberId = value.metadata?.phone_number_id ?? "";

      for (const message of value.messages) {
        const timestamp = message.timestamp
          ? new Date(Number(message.timestamp) * 1000)
          : new Date();

        if (message.type === "reaction" && "reaction" in message) {
          const reaction: NormalizedIncomingReaction = {
            kind: "reaction",
            externalMessageId: message.id,
            fromPhone: message.from,
            toPhoneNumberId,
            targetMessageId: message.reaction.message_id,
            emoji: message.reaction.emoji,
            timestamp,
            rawPayload: payload
          };
          if (fromName) reaction.fromName = fromName;
          if (toPhoneDisplay) reaction.toPhoneDisplay = toPhoneDisplay;
          normalized.push(reaction);
          continue;
        }

        if (message.type === "edit" && "edit" in message) {
          const text = extractEditedMessageText(message.edit.message);
          if (!text) {
            continue;
          }

          const edit: NormalizedIncomingEdit = {
            kind: "edit",
            externalMessageId: message.id,
            fromPhone: message.from,
            toPhoneNumberId,
            originalMessageId: message.edit.original_message_id,
            text,
            timestamp,
            rawPayload: payload
          };
          if (fromName) edit.fromName = fromName;
          if (toPhoneDisplay) edit.toPhoneDisplay = toPhoneDisplay;
          normalized.push(edit);
          continue;
        }

        if (message.type === "revoke" && "revoke" in message) {
          const revoke: NormalizedIncomingRevoke = {
            kind: "revoke",
            externalMessageId: message.id,
            fromPhone: message.from,
            toPhoneNumberId,
            originalMessageId: message.revoke.original_message_id,
            timestamp,
            rawPayload: payload
          };
          if (fromName) revoke.fromName = fromName;
          if (toPhoneDisplay) revoke.toPhoneDisplay = toPhoneDisplay;
          normalized.push(revoke);
          continue;
        }

        if (!("text" in message)) {
          continue;
        }

        const body = message.text?.body?.trim();
        if (!body) {
          continue;
        }

        const item: NormalizedIncomingMessage = {
          kind: "message",
          externalMessageId: message.id,
          fromPhone: message.from,
          toPhoneNumberId,
          text: body,
          timestamp,
          rawPayload: payload
        };
        if (fromName) item.fromName = fromName;
        if (toPhoneDisplay) item.toPhoneDisplay = toPhoneDisplay;
        if ("context" in message && message.context?.id) {
          item.replyContext = {
            externalMessageId: message.context.id,
            ...(message.context.from ? { fromPhone: message.context.from } : {})
          };
        }

        normalized.push(item);
      }
    }
  }

  return normalized;
}

/** @deprecated Use normalizeWebhookEvents */
export function normalizeWebhookMessages(payload: unknown) {
  return normalizeWebhookEvents(payload).filter(
    (event): event is NormalizedIncomingMessage => event.kind === "message"
  );
}
