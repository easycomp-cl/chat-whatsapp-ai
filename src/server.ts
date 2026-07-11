import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { assertDatabaseConnection, DATABASE_UNAVAILABLE_MESSAGE, prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";
import { startMessageWorker, stopMessageWorker } from "./modules/queue/message.worker.js";
import {
  startKnowledgeIndexWorker,
  stopKnowledgeIndexWorker
} from "./modules/queue/knowledge-index.worker.js";
import {
  startChatImportAnalysisWorker,
  stopChatImportAnalysisWorker
} from "./modules/queue/chat-import-analysis.worker.js";
import { disconnectRedis } from "./lib/redis.js";

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

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "EasyComp Bot IA listening");
  });

  async function shutdown() {
    logger.info("Shutting down");
    await stopMessageWorker();
    await stopKnowledgeIndexWorker();
    await stopChatImportAnalysisWorker();
    server.close(async () => {
      await disconnectRedis();
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap();
