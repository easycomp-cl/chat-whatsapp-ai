import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });
dotenv.config({ path: path.join(root, ".env") });

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.message.groupBy({
    by: ["mediaStorageBucket"],
    where: { mediaStoragePath: { not: null } },
    _count: { id: true }
  });

  const recent = await prisma.message.findMany({
    where: {
      mediaStoragePath: { not: null },
      contentType: { in: ["IMAGE", "DOCUMENT"] }
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      contentType: true,
      mediaStorageBucket: true,
      mediaStoragePath: true,
      mediaMimeType: true,
      createdAt: true
    }
  });

  console.log(
    JSON.stringify(
      {
        env: {
          supabase_url_set: Boolean(process.env.SUPABASE_URL),
          supabase_key_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          chat_media_bucket: process.env.SUPABASE_CHAT_MEDIA_BUCKET ?? "chat-media",
          storage_path: process.env.STORAGE_PATH ?? "(default ./storage)"
        },
        media_by_bucket: rows,
        recent_media_messages: recent
      },
      null,
      2
    )
  );

  const sample = recent.find((m) => m.mediaStorageBucket === "chat-media");
  if (sample?.mediaStorageBucket && sample.mediaStoragePath) {
    const { chatMediaStorageService } = await import(
      "../src/modules/conversations/infrastructure/chat-media-storage.service.js"
    );
    try {
      const buffer = await chatMediaStorageService.readBuffer(
        sample.mediaStorageBucket,
        sample.mediaStoragePath
      );
      console.log(
        JSON.stringify(
          {
            supabase_read_test: {
              message_id: sample.id,
              ok: true,
              bytes: buffer.length
            }
          },
          null,
          2
        )
      );
    } catch (error) {
      console.log(
        JSON.stringify(
          {
            supabase_read_test: {
              message_id: sample.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            }
          },
          null,
          2
        )
      );
    }
  }

  const localSample = await prisma.message.findFirst({
    where: { mediaStorageBucket: "local" },
    select: { id: true, mediaStoragePath: true, createdAt: true }
  });
  if (localSample) {
    console.log(
      JSON.stringify(
        {
          local_media_warning:
            "Mensajes con bucket local se pierden al reiniciar ECS (disco efímero /app/storage)",
          example: localSample
        },
        null,
        2
      )
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
