import { UnrecoverableError, Worker } from "bullmq";
import { logger } from "../../lib/logger.js";
import {
  isNonRetryableWhatsAppError,
  MessageRouterService
} from "../router/message-router.service.js";
import { ReactionRouterService } from "../router/reaction-router.service.js";
import { MessageUpdateRouterService } from "../router/message-update-router.service.js";
import { DeliveryStatusRouterService } from "../router/delivery-status-router.service.js";
import { bullmqConnection, bullmqWorkerOptions } from "./bullmq.config.js";
import { MESSAGE_QUEUE_NAME, type MessageJobData } from "./message.queue.js";

let worker: Worker<MessageJobData> | null = null;

export function startMessageWorker() {
  if (worker) {
    return worker;
  }

  const router = new MessageRouterService();
  const reactionRouter = new ReactionRouterService();
  const messageUpdateRouter = new MessageUpdateRouterService();
  const deliveryStatusRouter = new DeliveryStatusRouterService();

  worker = new Worker<MessageJobData>(
    MESSAGE_QUEUE_NAME,
    async (job) => {
      try {
        const { event } = job.data;
        if (event.kind === "status") {
          await deliveryStatusRouter.route(event);
          return;
        }
        if (event.kind === "reaction") {
          await reactionRouter.route(event);
          return;
        }
        if (event.kind === "edit") {
          await messageUpdateRouter.routeEdit(event);
          return;
        }
        if (event.kind === "revoke") {
          await messageUpdateRouter.routeRevoke(event);
          return;
        }
        await router.route(event);
      } catch (err) {
        if (isNonRetryableWhatsAppError(err)) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    {
      connection: bullmqConnection,
      concurrency: 5,
      ...bullmqWorkerOptions
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Message worker job failed");
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "Message worker job completed");
  });

  return worker;
}

export async function stopMessageWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
