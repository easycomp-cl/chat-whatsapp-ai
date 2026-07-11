import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { assertDatabaseConnection, DATABASE_UNAVAILABLE_MESSAGE, prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";

async function bootstrap() {
  try {
    await assertDatabaseConnection();
  } catch (error) {
    logger.fatal({ err: error }, DATABASE_UNAVAILABLE_MESSAGE);
    await prisma.$disconnect();
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "EasyComp Bot IA API listening");
  });

  async function shutdown() {
    logger.info("Shutting down API");
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap();
