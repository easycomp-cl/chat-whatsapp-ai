import OpenAI from "openai";
import { env } from "../../config/env.js";
import { embeddingCacheService } from "./embedding-cache.service.js";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export class EmbeddingService {
  async embed(text: string, tenantId?: string): Promise<number[]> {
    if (tenantId) {
      const cached = await embeddingCacheService.get(tenantId, text);
      if (cached) {
        return cached;
      }
    }

    const response = await client.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text
    });
    const embedding = response.data[0]?.embedding ?? [];

    if (tenantId && embedding.length) {
      await embeddingCacheService.set(tenantId, text, embedding);
    }

    return embedding;
  }

  async embedBatch(texts: string[], tenantId?: string): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    if (!tenantId) {
      const response = await client.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: texts
      });
      return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    }

    const results: number[][] = new Array(texts.length);
    const missing: { index: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const cached = await embeddingCacheService.get(tenantId, text);
      if (cached) {
        results[i] = cached;
      } else {
        missing.push({ index: i, text });
      }
    }

    if (missing.length) {
      const response = await client.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: missing.map((m) => m.text)
      });
      const ordered = response.data.sort((a, b) => a.index - b.index);
      for (let j = 0; j < missing.length; j++) {
        const embedding = ordered[j]?.embedding ?? [];
        const { index, text } = missing[j]!;
        results[index] = embedding;
        if (embedding.length) {
          await embeddingCacheService.set(tenantId, text, embedding);
        }
      }
    }

    return results;
  }

  toPgVector(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
  }
}

export const embeddingService = new EmbeddingService();
