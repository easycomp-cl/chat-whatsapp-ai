import { getRedis } from "../../../lib/redis.js";

const LOCK_PREFIX = "flow-run-lock:";
const DEFAULT_TTL_MS = 15_000;

export class FlowRunLockService {
  async withLock<T>(runId: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
    const redis = getRedis();
    const key = `${LOCK_PREFIX}${runId}`;
    const token = `${Date.now()}-${Math.random()}`;

    const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
    if (acquired !== "OK") {
      throw new Error(`No se pudo adquirir lock para flow run ${runId}`);
    }

    try {
      return await fn();
    } finally {
      const current = await redis.get(key);
      if (current === token) {
        await redis.del(key);
      }
    }
  }
}

export const flowRunLockService = new FlowRunLockService();
