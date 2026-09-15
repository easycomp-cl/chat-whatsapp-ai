import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Redis from "ioredis";
import { Queue } from "bullmq";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

function maskRedisUrl(url: string | undefined) {
  if (!url) return null;
  return url.replace(/:([^:@]+)@/, ":***@");
}

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log(JSON.stringify({ ok: false, error: "REDIS_URL no definido" }, null, 2));
    process.exit(1);
  }

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

  try {
    const ping = await redis.ping();
    await redis.set("verify:delivery:test", "1", "EX", 30);
    const get = await redis.get("verify:delivery:test");

    const queue = new Queue("whatsapp-messages-test", {
      connection: { url: redisUrl, maxRetriesPerRequest: null }
    });

    const job = await queue.add(
      "process",
      { event: { kind: "status", probe: true } },
      { jobId: `probe-${Date.now()}` }
    );
    await job.remove();
    await queue.close();

    console.log(
      JSON.stringify(
        {
          ok: true,
          redisUrl: maskRedisUrl(redisUrl),
          ping,
          get,
          bullmqEnqueue: "ok"
        },
        null,
        2
      )
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          redisUrl: maskRedisUrl(redisUrl),
          error: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
