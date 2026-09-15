/**
 * Exporta datos del proyecto Supabase viejo a .migration-backup/ (JSON).
 *
 * Uso:
 *   $env:OLD_DATABASE_URL="postgresql://...@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
 *   node scripts/export-supabase-region-data.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const OLD_URL = process.env.OLD_DATABASE_URL;
const OUT_DIR = process.env.EXPORT_DIR ?? join(process.cwd(), ".migration-backup");

if (!OLD_URL) {
  console.error("Define OLD_DATABASE_URL");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: OLD_URL } } });

const PRISMA_TABLES = [
  { model: "tenant", file: "Tenant.json" },
  { model: "tenantConfig", file: "TenantConfig.json" },
  { model: "tenantChannel", file: "TenantChannel.json" },
  { model: "tenantAdmin", file: "TenantAdmin.json" },
  { model: "tenantIntegration", file: "TenantIntegration.json" },
  { model: "customer", file: "Customer.json" },
  { model: "conversation", file: "Conversation.json" },
  { model: "message", file: "Message.json" },
  { model: "messageReaction", file: "MessageReaction.json" },
  { model: "usageEvent", file: "UsageEvent.json" },
  { model: "tenantCatalogProduct", file: "TenantCatalogProduct.json" },
  { model: "tenantDeliveryRegion", file: "TenantDeliveryRegion.json" },
  { model: "tenantDeliveryCommune", file: "TenantDeliveryCommune.json" },
  { model: "chatImportJob", file: "ChatImportJob.json" },
  { model: "importedChatMessage", file: "ImportedChatMessage.json" },
  { model: "detectedFaqSuggestion", file: "DetectedFaqSuggestion.json" },
  { model: "toneAnalysisResult", file: "ToneAnalysisResult.json" },
  { model: "auditLog", file: "AuditLog.json" }
];

const RAW_TABLES = [
  { sql: `SELECT * FROM auth.users ORDER BY created_at`, file: "auth.users.json" },
  { sql: `SELECT * FROM auth.identities ORDER BY created_at`, file: "auth.identities.json" },
  { sql: `SELECT * FROM public.profiles ORDER BY created_at`, file: "profiles.json" },
  { sql: `SELECT * FROM public.conversation_notes ORDER BY created_at`, file: "conversation_notes.json" },
  {
    sql: `SELECT id, "tenantId", question, answer, category, priority, "alternatePhrases", keywords, "searchText", "questionEmbedding"::text AS "questionEmbedding", "isActive", "createdAt", "updatedAt" FROM public."TenantFaq" ORDER BY "createdAt"`,
    file: "TenantFaq.json"
  },
  {
    sql: `SELECT * FROM public."TenantDocument" ORDER BY "createdAt"`,
    file: "TenantDocument.json"
  },
  {
    sql: `SELECT id, "tenantId", "documentId", "chunkText", embedding::text AS embedding, metadata, "createdAt" FROM public."KnowledgeChunk" ORDER BY "createdAt"`,
    file: "KnowledgeChunk.json"
  }
];

function serialize(value) {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );
}

async function writeJson(file, data) {
  const path = join(OUT_DIR, file);
  await writeFile(path, serialize(data), "utf8");
  const count = Array.isArray(data) ? data.length : 1;
  console.log(`${file}: ${count} filas`);
  return count;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Exportando a ${OUT_DIR}\n`);
  await db.$queryRaw`SELECT 1`;

  const summary = {};

  for (const { sql, file } of RAW_TABLES) {
    const rows = await db.$queryRawUnsafe(sql);
    summary[file] = await writeJson(file, rows);
  }

  for (const { model, file } of PRISMA_TABLES) {
    const rows = await db[model].findMany();
    summary[file] = await writeJson(file, rows);
  }

  const meta = {
    exportedAt: new Date().toISOString(),
    sourceRef: "vskucklcqgmcckezeopq",
    counts: summary
  };
  await writeJson("_meta.json", meta);

  console.log("\nExport completado.");
}

main()
  .catch((err) => {
    console.error("Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
