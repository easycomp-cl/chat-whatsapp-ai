/**
 * Busca clientes/conversaciones por sufijo de teléfono.
 * Uso: npx tsx scripts/find-customer-by-phone-suffix.ts 2062
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const suffix = process.argv[2] ?? "2062";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();

const customers = await prisma.customer.findMany({
  where: { phoneNumber: { endsWith: suffix } },
  include: {
    conversations: {
      orderBy: { updatedAt: "desc" },
      take: 3,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    },
  },
});

console.log(
  JSON.stringify(
    customers.map((c) => ({
      id: c.id,
      phone: c.phoneNumber,
      tenantId: c.tenantId,
      conversations: c.conversations.map((conv) => ({
        id: conv.id,
        mode: conv.mode,
        status: conv.status,
        handoffReason: conv.handoffReason,
        botResumeAt: conv.botResumeAt,
        channelPhone: conv.channelPhoneNumber,
        updatedAt: conv.updatedAt,
        lastMessageAt: conv.lastMessageAt,
        messages: conv.messages.map((m) => ({
          at: m.createdAt,
          dir: m.direction,
          sender: m.senderType,
          text: m.contentText?.slice(0, 120),
          deliveryStatus: m.deliveryStatus,
          externalId: m.externalId,
        })),
      })),
    })),
    null,
    2,
  ),
);

await prisma.$disconnect();
