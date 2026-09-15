import { UnrecoverableError, Worker } from "bullmq";
import { logger } from "../../lib/logger.js";
import { bullmqConnection, bullmqWorkerOptions } from "./bullmq.config.js";
import {
  WHATSAPP_TEMPLATES_QUEUE_NAME,
  type WhatsappTemplatesJobData
} from "./whatsapp-templates.queue.js";
import { WhatsappTemplateError } from "../whatsapp-templates/whatsapp-templates.errors.js";
import { whatsappTemplatesService } from "../whatsapp-templates/whatsapp-templates.service.js";

let worker: Worker<WhatsappTemplatesJobData> | null = null;

export function startWhatsappTemplatesWorker() {
  if (worker) return worker;

  worker = new Worker<WhatsappTemplatesJobData>(
    WHATSAPP_TEMPLATES_QUEUE_NAME,
    async (job) => {
      try {
        const result = await whatsappTemplatesService.provisionDefaults(job.data.tenantId);
        logger.info(
          { tenantId: job.data.tenantId, created: result.created, skipped: result.skipped },
          "Pack de plantillas WhatsApp provisionado"
        );
      } catch (error) {
        if (error instanceof WhatsappTemplateError && error.statusCode < 500) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
    },
    {
      connection: bullmqConnection,
      concurrency: 2,
      ...bullmqWorkerOptions
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "WhatsApp templates worker job failed");
  });

  return worker;
}

export async function stopWhatsappTemplatesWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
