import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();
const tenantId = process.argv[2] ?? "cmrgmk5vf0000gbngos6i7jnt";
const channels = await prisma.tenantChannel.findMany({
  where: { tenantId },
  select: {
    id: true,
    tenantId: true,
    phoneNumberId: true,
    phoneNumber: true,
    status: true,
    isActive: true
  }
});
console.log(JSON.stringify(channels, null, 2));
await prisma.$disconnect();
