import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();
const convId = "cmrgqmcnk0009icifzqofhvu9";

const conv = await prisma.conversation.findUnique({
  where: { id: convId },
  include: {
    customer: true,
    messages: { orderBy: { createdAt: "asc" }, take: 20 },
  },
});

console.log(
  JSON.stringify(
    {
      mode: conv?.mode,
      handoffReason: conv?.handoffReason,
      botResumeAt: conv?.botResumeAt,
      customer: conv?.customer?.phoneNumber,
      messages: conv?.messages.map((m) => ({
        at: m.createdAt,
        dir: m.direction,
        sender: m.senderType,
        text: m.contentText?.slice(0, 80),
      })),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
