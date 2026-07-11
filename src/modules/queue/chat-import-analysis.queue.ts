import { Queue } from "bullmq";
import { bullmqQueueOptions } from "./bullmq.config.js";

export const CHAT_IMPORT_QUEUE_NAME = "chat-import-analysis";

export type ChatImportJobData = {
  importJobId: string;
  tenantId: string;
};

let chatImportQueue: Queue<ChatImportJobData> | null = null;

export function getChatImportQueue(): Queue<ChatImportJobData> {
  if (!chatImportQueue) {
    chatImportQueue = new Queue<ChatImportJobData>(
      CHAT_IMPORT_QUEUE_NAME,
      bullmqQueueOptions({
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50
      })
    );
  }
  return chatImportQueue;
}

export async function enqueueChatImportAnalysis(importJobId: string, tenantId: string) {
  const queue = getChatImportQueue();
  await queue.add(
    "analyze",
    { importJobId, tenantId },
    { jobId: `chat-import-${importJobId}` }
  );
}

export async function removeChatImportFromQueue(importJobId: string) {
  const queue = getChatImportQueue();
  const job = await queue.getJob(`chat-import-${importJobId}`);
  if (job) {
    await job.remove();
  }
}
