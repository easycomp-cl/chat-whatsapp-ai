import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();
const pattern = process.argv[2] ?? "2062";

const customers = await prisma.$queryRawUnsafe<
  Array<{ phoneNumber: string; tenantId: string; createdAt: Date }>
>(
  `SELECT "phoneNumber", "tenantId", "createdAt" FROM "Customer" WHERE "phoneNumber" LIKE $1`,
  `%${pattern}%`,
);

const msgs = await prisma.$queryRawUnsafe<
  Array<{ senderPhone: string; contentText: string; createdAt: Date }>
>(
  `SELECT "senderPhone", "contentText", "createdAt" FROM "Message"
   WHERE "senderPhone" LIKE $1 OR "receiverPhone" LIKE $1
   ORDER BY "createdAt" DESC LIMIT 20`,
  `%${pattern}%`,
);

console.log(JSON.stringify({ pattern, customers, msgs }, null, 2));
await prisma.$disconnect();
