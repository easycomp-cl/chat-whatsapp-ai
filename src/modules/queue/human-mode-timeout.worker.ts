import { Worker } from "bullmq";
import { logger } from "../../lib/logger.js";
import { humanModeTimeoutService } from "../runtime/human-mode-timeout.service.js";
import { bullmqConnection, bullmqWorkerOptions } from "./bullmq.config.js";
import {
  HUMAN_MODE_TIMEOUT_QUEUE_NAME,
  humanModeTimeoutQueue,
  type HumanModeTimeoutJobData
} from "./human-mode-timeout.queue.js";

let worker: Worker<HumanModeTimeoutJobData> | null = null;

export const HUMAN_MODE_TIMEOUT_REPEAT_EVERY_MS = 60_000;

export async function processHumanModeTimeoutJob() {
  await humanModeTimeoutService.processExpiredConversations();
}

export function startHumanModeTimeoutWorker() {
  if (worker) return worker;

  worker = new Worker<HumanModeTimeoutJobData>(
    HUMAN_MODE_TIMEOUT_QUEUE_NAME,
    async () => {
      await processHumanModeTimeoutJob();
    },
    {
      connection: bullmqConnection,
      concurrency: 1,
      ...bullmqWorkerOptions
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Human mode timeout worker job failed");
  });

  return worker;
}

export async function stopHumanModeTimeoutWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

export async function scheduleHumanModeTimeoutCheck() {
  const existingRepeatable = await humanModeTimeoutQueue.getRepeatableJobs();
  const alreadyScheduled = existingRepeatable.some(
    (job) =>
      job.id === "human-mode-timeout-every-minute" ||
      job.key?.includes("human-mode-timeout-every-minute")
  );

  if (alreadyScheduled) {
    logger.info("Human mode timeout check already scheduled; skipping duplicate");
    return;
  }

  await humanModeTimeoutQueue.add(
    "resume-expired-human-mode",
    {},
    {
      repeat: {
        every: HUMAN_MODE_TIMEOUT_REPEAT_EVERY_MS
      },
      jobId: "human-mode-timeout-every-minute"
    }
  );
  logger.info("Human mode timeout check scheduled every 60 seconds");
}
