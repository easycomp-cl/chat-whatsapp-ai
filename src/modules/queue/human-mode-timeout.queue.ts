import { Queue } from "bullmq";
import { bullmqQueueOptions } from "./bullmq.config.js";

export const HUMAN_MODE_TIMEOUT_QUEUE_NAME = "human-mode-timeout";

export type HumanModeTimeoutJobData = Record<string, never>;

export const humanModeTimeoutQueue = new Queue<HumanModeTimeoutJobData>(
  HUMAN_MODE_TIMEOUT_QUEUE_NAME,
  bullmqQueueOptions({
    removeOnComplete: { count: 5 },
    removeOnFail: { count: 10 }
  })
);
