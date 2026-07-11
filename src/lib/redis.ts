import { Redis as RedisClient } from "ioredis";
import { bullmqConnection } from "../modules/queue/bullmq.config.js";

let client: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!client) {
    client = new RedisClient(bullmqConnection.url, {
      maxRetriesPerRequest: bullmqConnection.maxRetriesPerRequest
    });
  }
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
