import { Queue } from "bullmq";
import { bullmqQueueOptions } from "./bullmq.config.js";

export const TOKEN_EXPIRATION_CHECK_QUEUE_NAME = "token-expiration-check";

export type TokenExpirationCheckJobData = Record<string, never>;

export const tokenExpirationCheckQueue = new Queue<TokenExpirationCheckJobData>(
  TOKEN_EXPIRATION_CHECK_QUEUE_NAME,
  bullmqQueueOptions({
    removeOnComplete: { count: 5 },
    removeOnFail: { count: 10 }
  })
);
