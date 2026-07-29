import { logger } from "./lib/logger.js";
import { assertDatabaseConnection, DATABASE_UNAVAILABLE_MESSAGE, prisma } from "./lib/prisma.js";
import { disconnectRedis } from "./lib/redis.js";
import { startChatImportAnalysisWorker, stopChatImportAnalysisWorker } from "./modules/queue/chat-import-analysis.worker.js";
import { startKnowledgeIndexWorker, stopKnowledgeIndexWorker } from "./modules/queue/knowledge-index.worker.js";
import { startMessageWorker, stopMessageWorker } from "./modules/queue/message.worker.js";
import { startFlowWebhookDeliveryWorker, stopFlowWebhookDeliveryWorker } from "./modules/queue/flow-webhook-delivery.worker.js";

async function bootstrap() {
  try {
    await assertDatabaseConnection();
  } catch (error) {
    logger.fatal({ err: error }, DATABASE_UNAVAILABLE_MESSAGE);
    await prisma.$disconnect();
    process.exit(1);
  }

  startMessageWorker();
  startKnowledgeIndexWorker();
  startChatImportAnalysisWorker();
  startFlowWebhookDeliveryWorker();

  logger.info("EasyComp Bot IA workers listening");

  async function shutdown() {
    logger.info("Shutting down workers");
    await stopMessageWorker();
    await stopKnowledgeIndexWorker();
    await stopChatImportAnalysisWorker();
    await stopFlowWebhookDeliveryWorker();
    await disconnectRedis();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap();
