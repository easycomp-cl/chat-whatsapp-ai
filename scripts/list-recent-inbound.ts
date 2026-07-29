import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();
const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

const inbound = await prisma.message.findMany({
  where: { direction: "INBOUND", createdAt: { gte: since } },
  orderBy: { createdAt: "desc" },
  take: 30,
  select: {
    createdAt: true,
    senderPhone: true,
    contentText: true,
    senderType: true,
    tenantId: true,
    conversationId: true,
  },
});

console.log(JSON.stringify({ since, count: inbound.length, inbound }, null, 2));
await prisma.$disconnect();
