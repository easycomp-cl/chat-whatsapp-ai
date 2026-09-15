import { Queue } from "bullmq";
import { logger } from "../../lib/logger.js";
import { bullmqQueueOptions } from "./bullmq.config.js";

export const WHATSAPP_TEMPLATES_QUEUE_NAME = "whatsapp-templates";

export type WhatsappTemplatesJobData = {
  tenantId: string;
};

let whatsappTemplatesQueue: Queue<WhatsappTemplatesJobData> | null = null;

export function getWhatsappTemplatesQueue(): Queue<WhatsappTemplatesJobData> {
  if (!whatsappTemplatesQueue) {
    whatsappTemplatesQueue = new Queue<WhatsappTemplatesJobData>(
      WHATSAPP_TEMPLATES_QUEUE_NAME,
      bullmqQueueOptions({
        attempts: 3,
        backoff: { type: "exponential", delay: 4000 },
        removeOnComplete: 100,
        removeOnFail: 200
      })
    );
  }
  return whatsappTemplatesQueue;
}

export async function enqueueProvisionStandardTemplates(tenantId: string) {
  const queue = getWhatsappTemplatesQueue();
  await queue.add("provision-defaults", { tenantId });
}

export async function enqueueProvisionStandardTemplatesSafe(tenantId: string) {
  try {
    await enqueueProvisionStandardTemplates(tenantId);
  } catch (error) {
    logger.warn({ tenantId, err: error }, "No se pudo encolar provisión de plantillas WhatsApp");
  }
}
