import type { DefaultJobOptions, QueueOptions, WorkerOptions } from "bullmq";
import { env } from "../../config/env.js";

/** Conexión compartida BullMQ / ioredis (Upstash requiere maxRetriesPerRequest: null). */
export const bullmqConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null as null
};

/**
 * Workers en idle hacen polling a Redis. Valores por defecto de BullMQ (~5 ms)
 * agotan el free tier de Upstash (500k cmds/mes) en pocos días.
 * @see https://upstash.com/docs/redis/integrations/bullmq
 */
export const bullmqWorkerOptions: Pick<
  WorkerOptions,
  "drainDelay" | "stalledInterval" | "maxStalledCount"
> = {
  drainDelay: 10_000,
  stalledInterval: 300_000,
  maxStalledCount: 1
};

export function bullmqQueueOptions(defaultJobOptions: DefaultJobOptions): QueueOptions {
  return {
    connection: bullmqConnection,
    defaultJobOptions
  };
}
