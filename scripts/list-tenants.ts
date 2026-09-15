import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();
const tenants = await prisma.tenant.findMany({
  select: { id: true, name: true, slug: true },
  orderBy: { name: "asc" }
});
console.log(JSON.stringify(tenants, null, 2));
await prisma.$disconnect();
