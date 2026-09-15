/**
 * Importa datos desde .migration-backup/ al proyecto Supabase nuevo.
 *
 * Uso:
 *   $env:NEW_DATABASE_URL="postgresql://...@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
 *   node scripts/import-supabase-region-data.mjs
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const NEW_URL = process.env.NEW_DATABASE_URL;
const IN_DIR = process.env.EXPORT_DIR ?? join(process.cwd(), ".migration-backup");

if (!NEW_URL) {
  console.error("Define NEW_DATABASE_URL");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url: NEW_URL } } });

async function loadJson(file) {
  const raw = await readFile(join(IN_DIR, file), "utf8");
  return JSON.parse(raw);
}

const PRISMA_ORDER = [
  "Tenant.json",
  "TenantConfig.json",
  "TenantChannel.json",
  "TenantAdmin.json",
  "TenantIntegration.json",
  "Customer.json",
  "Conversation.json",
  "Message.json",
  "MessageReaction.json",
  "UsageEvent.json",
  "TenantCatalogProduct.json",
  "TenantDeliveryRegion.json",
  "TenantDeliveryCommune.json",
  "ChatImportJob.json",
  "ImportedChatMessage.json",
  "DetectedFaqSuggestion.json",
  "ToneAnalysisResult.json",
  "AuditLog.json"
];

const MODEL_BY_FILE = {
  "Tenant.json": "tenant",
  "TenantConfig.json": "tenantConfig",
  "TenantChannel.json": "tenantChannel",
  "TenantAdmin.json": "tenantAdmin",
  "TenantIntegration.json": "tenantIntegration",
  "Customer.json": "customer",
  "Conversation.json": "conversation",
  "Message.json": "message",
  "MessageReaction.json": "messageReaction",
  "UsageEvent.json": "usageEvent",
  "TenantCatalogProduct.json": "tenantCatalogProduct",
  "TenantDeliveryRegion.json": "tenantDeliveryRegion",
  "TenantDeliveryCommune.json": "tenantDeliveryCommune",
  "ChatImportJob.json": "chatImportJob",
  "ImportedChatMessage.json": "importedChatMessage",
  "DetectedFaqSuggestion.json": "detectedFaqSuggestion",
  "ToneAnalysisResult.json": "toneAnalysisResult",
  "AuditLog.json": "auditLog"
};

async function insertAuthUsers(rows) {
  if (!rows.length) {
    console.log("auth.users: 0 filas");
    return;
  }
  for (const row of rows) {
    await db.$executeRawUnsafe(
      `INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
        recovery_token, recovery_sent_at, email_change_token_new, email_change,
        email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
        phone_change, phone_change_token, phone_change_sent_at,
        email_change_token_current, email_change_confirm_status, banned_until,
        reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6,
        $7::timestamptz, $8::timestamptz, $9, $10::timestamptz,
        $11, $12::timestamptz, $13, $14,
        $15::timestamptz, $16::timestamptz, $17::jsonb, $18::jsonb,
        $19, $20::timestamptz, $21::timestamptz, $22, $23::timestamptz,
        $24, $25, $26::timestamptz,
        $27, $28, $29::timestamptz,
        $30, $31::timestamptz, $32, $33::timestamptz, $34
      ) ON CONFLICT (id) DO NOTHING`,
      row.instance_id,
      row.id,
      row.aud,
      row.role,
      row.email,
      row.encrypted_password,
      row.email_confirmed_at,
      row.invited_at,
      row.confirmation_token ?? "",
      row.confirmation_sent_at,
      row.recovery_token ?? "",
      row.recovery_sent_at,
      row.email_change_token_new ?? "",
      row.email_change ?? "",
      row.email_change_sent_at,
      row.last_sign_in_at,
      JSON.stringify(row.raw_app_meta_data ?? {}),
      JSON.stringify(row.raw_user_meta_data ?? {}),
      row.is_super_admin,
      row.created_at,
      row.updated_at,
      row.phone,
      row.phone_confirmed_at,
      row.phone_change ?? "",
      row.phone_change_token ?? "",
      row.phone_change_sent_at,
      row.email_change_token_current ?? "",
      row.email_change_confirm_status ?? 0,
      row.banned_until,
      row.reauthentication_token ?? "",
      row.reauthentication_sent_at,
      row.is_sso_user ?? false,
      row.deleted_at,
      row.is_anonymous ?? false
    );
  }
  console.log(`auth.users: ${rows.length} filas`);
}

async function insertAuthIdentities(rows) {
  if (!rows.length) {
    console.log("auth.identities: 0 filas");
    return;
  }
  for (const row of rows) {
    await db.$executeRawUnsafe(
      `INSERT INTO auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at,
        created_at, updated_at, id
      ) VALUES (
        $1, $2::uuid, $3::jsonb, $4, $5::timestamptz,
        $6::timestamptz, $7::timestamptz, $8::uuid
      ) ON CONFLICT (id) DO NOTHING`,
      row.provider_id,
      row.user_id,
      JSON.stringify(row.identity_data ?? {}),
      row.provider,
      row.last_sign_in_at,
      row.created_at,
      row.updated_at,
      row.id
    );
  }
  console.log(`auth.identities: ${rows.length} filas`);
}

async function insertProfiles(rows) {
  if (!rows.length) {
    console.log("profiles: 0 filas");
    return;
  }
  for (const row of rows) {
    await db.$executeRawUnsafe(
      `INSERT INTO public.profiles (id, user_id, business_id, full_name, role, agent_id, active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::public.user_role, $6, $7, $8::timestamptz, $9::timestamptz)
       ON CONFLICT (user_id) DO UPDATE SET
         business_id = EXCLUDED.business_id,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         agent_id = EXCLUDED.agent_id,
         active = EXCLUDED.active,
         updated_at = EXCLUDED.updated_at`,
      row.id,
      row.user_id,
      row.business_id,
      row.full_name,
      row.role,
      row.agent_id,
      row.active,
      row.created_at,
      row.updated_at
    );
  }
  console.log(`profiles: ${rows.length} filas`);
}

async function insertTenantFaqs(rows) {
  if (!rows.length) {
    console.log("TenantFaq.json: 0 filas");
    return;
  }
  for (const row of rows) {
    const embedding = row.questionEmbedding
      ? `'${row.questionEmbedding}'::vector`
      : "NULL";
    await db.$executeRawUnsafe(
      `INSERT INTO public."TenantFaq" (id, "tenantId", question, answer, category, priority, "alternatePhrases", keywords, "searchText", "questionEmbedding", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, ${embedding}, $10, $11::timestamptz, $12::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      row.id,
      row.tenantId,
      row.question,
      row.answer,
      row.category,
      row.priority,
      JSON.stringify(row.alternatePhrases ?? []),
      JSON.stringify(row.keywords ?? []),
      row.searchText,
      row.isActive,
      row.createdAt,
      row.updatedAt
    );
  }
  console.log(`TenantFaq.json: ${rows.length} filas`);
}

async function insertTenantDocuments(rows) {
  if (!rows.length) {
    console.log("TenantDocument.json: 0 filas");
    return;
  }
  const result = await db.tenantDocument.createMany({ data: rows, skipDuplicates: true });
  console.log(`TenantDocument.json: ${result.count} filas`);
}

async function insertKnowledgeChunks(rows) {
  if (!rows.length) {
    console.log("KnowledgeChunk.json: 0 filas");
    return;
  }
  for (const row of rows) {
    const embedding = row.embedding ? `'${row.embedding}'::vector` : "NULL";
    await db.$executeRawUnsafe(
      `INSERT INTO public."KnowledgeChunk" (id, "tenantId", "documentId", "chunkText", embedding, metadata, "createdAt")
       VALUES ($1, $2, $3, $4, ${embedding}, $5::jsonb, $6::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      row.id,
      row.tenantId,
      row.documentId,
      row.chunkText,
      JSON.stringify(row.metadata ?? {}),
      row.createdAt
    );
  }
  console.log(`KnowledgeChunk.json: ${rows.length} filas`);
}

async function main() {
  console.log(`Importando desde ${IN_DIR}\n`);
  await db.$queryRaw`SELECT 1`;

  await insertAuthUsers(await loadJson("auth.users.json"));
  await insertAuthIdentities(await loadJson("auth.identities.json"));

  for (const file of PRISMA_ORDER) {
    const rows = await loadJson(file);
    if (!rows.length) {
      console.log(`${file}: 0 filas`);
      continue;
    }
    const model = MODEL_BY_FILE[file];
    const result = await db[model].createMany({ data: rows, skipDuplicates: true });
    console.log(`${file}: ${result.count} filas`);
  }

  await insertTenantDocuments(await loadJson("TenantDocument.json"));
  await insertTenantFaqs(await loadJson("TenantFaq.json"));
  await insertKnowledgeChunks(await loadJson("KnowledgeChunk.json"));
  await insertProfiles(await loadJson("profiles.json"));

  const notes = await loadJson("conversation_notes.json");
  if (notes.length) {
    for (const row of notes) {
      await db.$executeRawUnsafe(
        `INSERT INTO public.conversation_notes (id, business_id, conversation_id, user_id, note, created_at)
         VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6::timestamptz)
         ON CONFLICT (id) DO NOTHING`,
        row.id,
        row.business_id,
        row.conversation_id,
        row.user_id,
        row.note,
        row.created_at
      );
    }
    console.log(`conversation_notes.json: ${notes.length} filas`);
  } else {
    console.log("conversation_notes.json: 0 filas");
  }

  console.log("\nImport completado.");
}

main()
  .catch((err) => {
    console.error("Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
