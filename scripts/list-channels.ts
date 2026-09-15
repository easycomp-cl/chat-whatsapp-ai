import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();

async function main() {
  const channels = await prisma.tenantChannel.findMany({
    include: { tenant: { select: { id: true, name: true, slug: true } } }
  });
  console.log(JSON.stringify(channels, null, 2));
}

main().finally(() => prisma.$disconnect());
