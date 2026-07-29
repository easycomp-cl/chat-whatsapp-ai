import { Worker } from "bullmq";
import { logger } from "../../lib/logger.js";
import { flowWebhookDeliveryService } from "../flows/flow-webhook-delivery.service.js";
import { bullmqConnection, bullmqWorkerOptions } from "./bullmq.config.js";
import {
  FLOW_WEBHOOK_DELIVERY_QUEUE_NAME,
  type FlowWebhookDeliveryJobData
} from "./flow-webhook-delivery.queue.js";

let worker: Worker<FlowWebhookDeliveryJobData> | null = null;

export function startFlowWebhookDeliveryWorker() {
  if (worker) {
    return worker;
  }

  worker = new Worker<FlowWebhookDeliveryJobData>(
    FLOW_WEBHOOK_DELIVERY_QUEUE_NAME,
    async (job) => {
      await flowWebhookDeliveryService.executeDelivery(job.data.deliveryId);
    },
    {
      connection: bullmqConnection,
      concurrency: 3,
      ...bullmqWorkerOptions
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, deliveryId: job?.data.deliveryId, err },
      "Flow webhook delivery job failed"
    );
  });

  worker.on("completed", (job) => {
    logger.debug(
      { jobId: job.id, deliveryId: job.data.deliveryId },
      "Flow webhook delivery job completed"
    );
  });

  return worker;
}

export async function stopFlowWebhookDeliveryWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
