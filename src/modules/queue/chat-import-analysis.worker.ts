import { Worker } from "bullmq";
import { logger } from "../../lib/logger.js";
import { chatImportService } from "../chat-analysis/services/chat-import.service.js";
import { bullmqConnection, bullmqWorkerOptions } from "./bullmq.config.js";
import {
  CHAT_IMPORT_QUEUE_NAME,
  type ChatImportJobData
} from "./chat-import-analysis.queue.js";

let worker: Worker<ChatImportJobData> | null = null;

export function startChatImportAnalysisWorker() {
  if (worker) {
    return worker;
  }

  worker = new Worker<ChatImportJobData>(
    CHAT_IMPORT_QUEUE_NAME,
    async (job) => {
      const { importJobId } = job.data;
      await chatImportService.processJob(importJobId);
    },
    {
      connection: bullmqConnection,
      concurrency: 1,
      ...bullmqWorkerOptions
    }
  );

  worker.on("failed", async (job, err) => {
    logger.error(
      { jobId: job?.id, importJobId: job?.data.importJobId, err },
      "Chat import analysis job failed"
    );

    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    const importJob = await chatImportService.getJobById(job.data.importJobId);
    if (importJob?.storagePath) {
      await chatImportService.purgeImportFilePublic(
        importJob.storagePath,
        importJob.id
      );
    }
  });

  worker.on("completed", (job) => {
    logger.debug(
      { jobId: job.id, importJobId: job.data.importJobId },
      "Chat import analysis job completed"
    );
  });

  return worker;
}

export async function stopChatImportAnalysisWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
