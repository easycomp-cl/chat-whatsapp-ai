import { Queue } from "bullmq";
import { env } from "../../config/env.js";
import { bullmqQueueOptions } from "./bullmq.config.js";

export const FLOW_WEBHOOK_DELIVERY_QUEUE_NAME = "flow-webhook-delivery";

export type FlowWebhookDeliveryJobData = {
  deliveryId: string;
};

let flowWebhookDeliveryQueue: Queue<FlowWebhookDeliveryJobData> | null = null;

export function getFlowWebhookDeliveryQueue(): Queue<FlowWebhookDeliveryJobData> {
  if (!flowWebhookDeliveryQueue) {
    flowWebhookDeliveryQueue = new Queue<FlowWebhookDeliveryJobData>(
      FLOW_WEBHOOK_DELIVERY_QUEUE_NAME,
      bullmqQueueOptions({
        attempts: env.FLOW_WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 200
      })
    );
  }
  return flowWebhookDeliveryQueue;
}

export async function enqueueFlowWebhookDelivery(
  deliveryId: string,
  options?: { force?: boolean }
) {
  const queue = getFlowWebhookDeliveryQueue();
  const jobId = `flow-webhook-${deliveryId}`;

  if (options?.force) {
    const existing = await queue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  }

  await queue.add("deliver", { deliveryId }, { jobId });
}
