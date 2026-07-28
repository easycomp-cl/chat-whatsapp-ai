import type { z } from "zod";
import type { editedInnerMessageSchema } from "./whatsapp.schemas.js";

type EditedInnerMessage = z.infer<typeof editedInnerMessageSchema>;

export function extractEditedMessageText(message: EditedInnerMessage): string | null {
  if (message.type === "text") {
    const body = message.text?.body?.trim();
    return body || null;
  }

  const caption =
    message.image?.caption?.trim() ??
    message.video?.caption?.trim() ??
    message.document?.caption?.trim();

  return caption || null;
}
