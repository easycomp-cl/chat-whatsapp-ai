import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

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
  ALTER TABLE "Conversation"
    ADD COLUMN IF NOT EXISTS "chatClearedAt" TIMESTAMPTZ;
`);
await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_desc_idx"
    ON "Message" ("conversationId", "createdAt" DESC);
`);
await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "Message_tenantId_createdAt_desc_idx"
    ON "Message" ("tenantId", "createdAt" DESC);
`);

console.log("Inbox migration applied");
await prisma.$disconnect();
