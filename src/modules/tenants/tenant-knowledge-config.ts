import type { Prisma } from "@prisma/client";
import { z } from "zod";

const knowledgeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  topK: z.number().int().min(1).max(20).default(5),
  chunkSize: z.number().int().min(100).max(2000).default(500),
  chunkOverlap: z.number().int().min(0).max(500).default(50),
  minConfidence: z.number().min(0).max(1).optional(),
  faqSimilarityThreshold: z.number().min(0).max(1).optional(),
  maxDocuments: z.number().int().positive().optional(),
  autoIndexOnCreate: z.boolean().default(true)
});

export type TenantKnowledgeConfig = z.infer<typeof knowledgeConfigSchema>;

const configJsonSchema = z.object({
  knowledge: knowledgeConfigSchema.optional()
});

export function parseTenantKnowledgeConfig(configJson: unknown): TenantKnowledgeConfig {
  const parsed = configJsonSchema.safeParse(configJson ?? {});
  if (!parsed.success || !parsed.data.knowledge) {
    return knowledgeConfigSchema.parse({});
  }
  return knowledgeConfigSchema.parse(parsed.data.knowledge);
}

export function mergeKnowledgeConfig(
  configJson: unknown,
  patch: Partial<TenantKnowledgeConfig>
): Prisma.InputJsonValue {
  const base =
    configJson && typeof configJson === "object" && !Array.isArray(configJson)
      ? (configJson as Record<string, unknown>)
      : {};
  const current = parseTenantKnowledgeConfig(base);
  return {
    ...base,
    knowledge: { ...current, ...patch }
  } as Prisma.InputJsonValue;
}
