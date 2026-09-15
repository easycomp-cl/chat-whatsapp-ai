import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.production", override: true });

const prisma = new PrismaClient();
const rows = await prisma.message.findMany({
  where: { conversationId: "cmrgqmcnk0009icifzqofhvu9", direction: "OUTBOUND" },
  orderBy: { createdAt: "desc" },
  take: 8,
  select: { id: true, contentText: true, externalId: true, createdAt: true }
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
