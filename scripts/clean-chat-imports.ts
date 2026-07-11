import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

async function cleanStorage(): Promise<number> {
  const storageRoot = path.resolve("./storage/tenants");
  let removed = 0;
  try {
    const tenants = await readdir(storageRoot);
    for (const tenant of tenants) {
      const importsDir = path.join(storageRoot, tenant, "chat-imports");
      try {
        const st = await stat(importsDir);
        if (!st.isDirectory()) continue;
        const files = await readdir(importsDir);
        for (const file of files) {
          await rm(path.join(importsDir, file), { force: true });
          removed++;
        }
      } catch {
        // carpeta inexistente
      }
    }
  } catch {
    // sin storage
  }
  return removed;
}

async function main() {
  const before = {
    jobs: await prisma.chatImportJob.count(),
    messages: await prisma.importedChatMessage.count(),
    suggestions: await prisma.detectedFaqSuggestion.count(),
    tones: await prisma.toneAnalysisResult.count(),
  };
  console.log("Antes:", before);

  const deleted = await prisma.chatImportJob.deleteMany({});
  const filesRemoved = await cleanStorage();

  const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const queue = new Queue("chat-import-analysis", { connection: redis });
  await queue.obliterate({ force: true });
  await queue.close();
  await redis.quit();

  const after = {
    jobs: await prisma.chatImportJob.count(),
    messages: await prisma.importedChatMessage.count(),
    suggestions: await prisma.detectedFaqSuggestion.count(),
    tones: await prisma.toneAnalysisResult.count(),
  };
  console.log("Después:", after);
  console.log(
    `Jobs eliminados: ${deleted.count}, archivos storage: ${filesRemoved}, cola Redis: limpiada`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
