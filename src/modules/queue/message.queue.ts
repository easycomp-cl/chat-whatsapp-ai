import { Queue } from "bullmq";
import { bullmqQueueOptions } from "./bullmq.config.js";
import type { NormalizedWebhookEvent } from "../../types/whatsapp.js";

export const MESSAGE_QUEUE_NAME = "whatsapp-messages";

export type MessageJobData = {
  event: NormalizedWebhookEvent;
};

let messageQueue: Queue<MessageJobData> | null = null;

export function getMessageQueue(): Queue<MessageJobData> {
  if (!messageQueue) {
    messageQueue = new Queue<MessageJobData>(
      MESSAGE_QUEUE_NAME,
      bullmqQueueOptions({
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200
      })
    );
  }
  return messageQueue;
}

export async function enqueueWebhookEvent(event: NormalizedWebhookEvent) {
  const queue = getMessageQueue();
  const jobId =
    event.kind === "status"
      ? `status:${event.externalMessageId}:${event.status}:${event.timestamp.getTime()}`
      : event.externalMessageId;

  await queue.add("process", { event }, { jobId });
}
