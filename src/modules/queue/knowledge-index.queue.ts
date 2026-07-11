import { Queue } from "bullmq";
import { bullmqQueueOptions } from "./bullmq.config.js";

export const KNOWLEDGE_INDEX_QUEUE_NAME = "knowledge-index";

export type KnowledgeIndexJobData = {
  documentId: string;
  tenantId: string;
};

let knowledgeIndexQueue: Queue<KnowledgeIndexJobData> | null = null;

export function getKnowledgeIndexQueue(): Queue<KnowledgeIndexJobData> {
  if (!knowledgeIndexQueue) {
    knowledgeIndexQueue = new Queue<KnowledgeIndexJobData>(
      KNOWLEDGE_INDEX_QUEUE_NAME,
      bullmqQueueOptions({
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: 200,
        removeOnFail: 100
      })
    );
  }
  return knowledgeIndexQueue;
}

export async function enqueueKnowledgeIndex(documentId: string, tenantId: string) {
  const queue = getKnowledgeIndexQueue();
  await queue.add(
    "index",
    { documentId, tenantId },
    { jobId: `kb-index-${documentId}` }
  );
}
