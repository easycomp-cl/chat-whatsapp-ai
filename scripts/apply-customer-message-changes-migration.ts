import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const databaseUrl = process.env.DATABASE_URL?.replace(":6543/", ":5432/").replace(
  "?pgbouncer=true",
  ""
);
if (!databaseUrl) {
  throw new Error("DATABASE_URL missing");
}

process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
  ALTER TABLE "Message"
    ADD COLUMN IF NOT EXISTS "contentTextSnapshot" TEXT,
    ADD COLUMN IF NOT EXISTS "customerEditedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "customerRevokedAt" TIMESTAMP(3);
`);

await prisma.$executeRawUnsafe(`DROP VIEW IF EXISTS public.messages`);

const createViewSql = readFileSync(
  path.join(
    root,
    "../chat-whatsapp-ai-ui/supabase/migrations/20260728140000_customer_message_changes.sql"
  ),
  "utf8"
)
  .replace(/DROP VIEW IF EXISTS public\.messages;\s*/i, "")
  .trim();

await prisma.$executeRawUnsafe(createViewSql);

console.log("Customer message changes migration applied (columns + messages view)");
await prisma.$disconnect();
