import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { normalizeWebhookEvents } from "./whatsapp.mapper.js";
import { webhookVerificationQuerySchema } from "./whatsapp.schemas.js";
import { enqueueWebhookEvent } from "../queue/message.queue.js";

export async function verifyWebhook(req: Request, res: Response) {
  const query = webhookVerificationQuerySchema.parse(req.query);
  if (
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === env.WHATSAPP_VERIFY_TOKEN &&
    query["hub.challenge"]
  ) {
    res.status(200).send(query["hub.challenge"]);
    return;
  }

  res.status(403).send("Invalid verification");
}

export async function receiveWebhook(req: Request, res: Response) {
  const events = normalizeWebhookEvents(req.body);
  const messages = events.filter((event) => event.kind === "message").length;
  const reactions = events.filter((event) => event.kind === "reaction").length;

  try {
    for (const event of events) {
      await enqueueWebhookEvent(event);
    }

    res.status(200).json({
      received: true,
      messages,
      reactions,
      queued: true
    });
  } catch (error) {
    logger.error({ error }, "Webhook enqueue error");
    res.status(200).json({
      received: true,
      messages,
      reactions,
      warning: "Error encolando evento. Revisa los logs."
    });
  }
}
