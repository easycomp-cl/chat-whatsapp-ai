/**
 * Copia datos public + auth.users desde proyecto Supabase viejo al nuevo.
 *
 * Uso:
 *   $env:OLD_DATABASE_URL="postgresql://...@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require"
 *   $env:NEW_DATABASE_URL="postgresql://...@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
 *   node scripts/migrate-supabase-region-data.mjs
 *
 * Requiere que el proyecto viejo NO esté en pausa.
 */
import { PrismaClient } from "@prisma/client";

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;

if (!OLD_URL || !NEW_URL) {
  console.error("Define OLD_DATABASE_URL y NEW_DATABASE_URL");
  process.exit(1);
}

const oldDb = new PrismaClient({ datasources: { db: { url: OLD_URL } } });
const newDb = new PrismaClient({ datasources: { db: { url: NEW_URL } } });

/** Orden respetando FKs */
const COPY_ORDER = [
  { model: "tenant", label: "Tenant" },
  { model: "tenantConfig", label: "TenantConfig" },
  { model: "tenantChannel", label: "TenantChannel" },
  { model: "tenantAdmin", label: "TenantAdmin" },
  { model: "tenantIntegration", label: "TenantIntegration" },
  { model: "customer", label: "Customer" },
  { model: "conversation", label: "Conversation" },
  { model: "message", label: "Message" },
  { model: "messageReaction", label: "MessageReaction" },
  { model: "tenantFaq", label: "TenantFaq" },
  { model: "tenantDocument", label: "TenantDocument" },
  { model: "knowledgeChunk", label: "KnowledgeChunk" },
  { model: "usageEvent", label: "UsageEvent" },
  { model: "tenantCatalogProduct", label: "TenantCatalogProduct" },
  { model: "tenantDeliveryRegion", label: "TenantDeliveryRegion" },
  { model: "tenantDeliveryCommune", label: "TenantDeliveryCommune" },
  { model: "chatImportJob", label: "ChatImportJob" },
  { model: "importedChatMessage", label: "ImportedChatMessage" },
  { model: "detectedFaqSuggestion", label: "DetectedFaqSuggestion" },
  { model: "toneAnalysisResult", label: "ToneAnalysisResult" },
  { model: "auditLog", label: "AuditLog" }
];

async function copyAuthUsers() {
  const users = await oldDb.$queryRawUnsafe(`SELECT * FROM auth.users ORDER BY created_at`);
  const identities = await oldDb.$queryRawUnsafe(`SELECT * FROM auth.identities ORDER BY created_at`);

  if (!Array.isArray(users) || users.length === 0) {
    console.log("auth.users: 0 filas (omitido)");
    return;
  }

  for (const row of users) {
    const cols = Object.keys(row);
    const vals = cols.map((c) => row[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const colList = cols.map((c) => `"${c}"`).join(", ");
    await newDb.$executeRawUnsafe(
      `INSERT INTO auth.users (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      ...vals
    );
  }
  console.log(`auth.users: ${users.length} filas`);

  if (Array.isArray(identities) && identities.length > 0) {
    for (const row of identities) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => row[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const colList = cols.map((c) => `"${c}"`).join(", ");
      await newDb.$executeRawUnsafe(
        `INSERT INTO auth.identities (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        ...vals
      );
    }
    console.log(`auth.identities: ${identities.length} filas`);
  }
}

async function copyProfiles() {
  const rows = await oldDb.$queryRawUnsafe(`SELECT * FROM public.profiles ORDER BY created_at`);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("profiles: 0 filas");
    return;
  }
  for (const row of rows) {
    await newDb.$executeRawUnsafe(
      `INSERT INTO public.profiles (id, user_id, business_id, full_name, role, agent_id, active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::public.user_role, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
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

async function copyConversationNotes() {
  const rows = await oldDb.$queryRawUnsafe(`SELECT * FROM public.conversation_notes ORDER BY created_at`);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("conversation_notes: 0 filas");
    return;
  }
  for (const row of rows) {
    await newDb.$executeRawUnsafe(
      `INSERT INTO public.conversation_notes (id, business_id, conversation_id, user_id, note, created_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      row.id,
      row.business_id,
      row.conversation_id,
      row.user_id,
      row.note,
      row.created_at
    );
  }
  console.log(`conversation_notes: ${rows.length} filas`);
}

async function main() {
  console.log("Conectando a proyecto viejo...");
  await oldDb.$queryRaw`SELECT 1`;
  console.log("Conectando a proyecto nuevo...");
  await newDb.$queryRaw`SELECT 1`;

  await copyAuthUsers();

  for (const { model, label } of COPY_ORDER) {
    const rows = await oldDb[model].findMany();
    if (rows.length === 0) {
      console.log(`${label}: 0 filas`);
      continue;
    }
    const result = await newDb[model].createMany({ data: rows, skipDuplicates: true });
    console.log(`${label}: ${result.count} filas copiadas (${rows.length} en origen)`);
  }

  await copyProfiles();
  await copyConversationNotes();

  console.log("\nMigración de datos completada.");
}

main()
  .catch((err) => {
    console.error("Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await oldDb.$disconnect();
    await newDb.$disconnect();
  });
