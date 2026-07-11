import { createHash } from "node:crypto";
import { getRedis } from "../../lib/redis.js";
import { normalizeForMatch } from "../../utils/direct-match.js";

const TTL_SECONDS = 60 * 60 * 24;

export class EmbeddingCacheService {
  private cacheKey(tenantId: string, text: string): string {
    const normalized = normalizeForMatch(text);
    const hash = createHash("sha256").update(normalized).digest("hex");
    return `emb:${tenantId}:${hash}`;
  }

  async get(tenantId: string, text: string): Promise<number[] | null> {
    const redis = getRedis();
    const raw = await redis.get(this.cacheKey(tenantId, text));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  }

  async set(tenantId: string, text: string, embedding: number[]): Promise<void> {
    const redis = getRedis();
    await redis.set(this.cacheKey(tenantId, text), JSON.stringify(embedding), "EX", TTL_SECONDS);
  }
}

export const embeddingCacheService = new EmbeddingCacheService();
