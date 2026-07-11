import { Worker } from "bullmq";
import { logger } from "../../lib/logger.js";
import { knowledgeIndexerService } from "../knowledge/knowledge-indexer.service.js";
import { bullmqConnection, bullmqWorkerOptions } from "./bullmq.config.js";
import {
  KNOWLEDGE_INDEX_QUEUE_NAME,
  type KnowledgeIndexJobData
} from "./knowledge-index.queue.js";

let worker: Worker<KnowledgeIndexJobData> | null = null;

export function startKnowledgeIndexWorker() {
  if (worker) {
    return worker;
  }

  worker = new Worker<KnowledgeIndexJobData>(
    KNOWLEDGE_INDEX_QUEUE_NAME,
    async (job) => {
      const { documentId } = job.data;
      await knowledgeIndexerService.indexDocument(documentId);
    },
    {
      connection: bullmqConnection,
      concurrency: 2,
      ...bullmqWorkerOptions
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, documentId: job?.data.documentId, err }, "KB index job failed");
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, documentId: job.data.documentId }, "KB index job completed");
  });

  return worker;
}

export async function stopKnowledgeIndexWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
