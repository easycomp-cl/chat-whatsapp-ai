import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const tenantId = process.env.TENANT_ID ?? "cmrgmk5vf0000gbngos6i7jnt";
const prisma = new PrismaClient();

const convs = await prisma.conversation.findMany({
  where: { tenantId },
  orderBy: { updatedAt: "desc" },
  take: 5,
  include: {
    messages: { orderBy: { createdAt: "desc" }, take: 5 },
    customer: true,
  },
});

console.log(
  JSON.stringify(
    {
      tenantId,
      conversationCount: convs.length,
      conversations: convs.map((c) => ({
        id: c.id,
        customerPhone: c.customer?.phoneNumber,
        status: c.status,
        updatedAt: c.updatedAt,
        lastMessageAt: c.lastMessageAt,
        messageCount: c.messages.length,
        messages: c.messages.map((m) => ({
          direction: m.direction,
          senderType: m.senderType,
          text: m.contentText?.slice(0, 100),
          externalId: m.externalId,
          createdAt: m.createdAt,
        })),
      })),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
