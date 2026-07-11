import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_GRAPH_VERSION: z.string().default("v20.0"),
  META_APP_SECRET: z.string().min(1),
  META_SYSTEM_USER_ACCESS_TOKEN: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  ENCRYPTION_SECRET: z.string().min(32),
  INTERNAL_API_KEY: z.string().min(1),
  DEFAULT_TIMEZONE: z.string().default("America/Santiago"),
  FAQ_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.80),
  STORAGE_PATH: z.string().default("./storage"),
  SHOPIFY_API_VERSION: z.string().default("2024-10"),
  SKIP_WEBHOOK_SIGNATURE: z
    .string()
    .optional()
    .transform((v) => v === "true")
});

export const env = envSchema.parse(process.env);
