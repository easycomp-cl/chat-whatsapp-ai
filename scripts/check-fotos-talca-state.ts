import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "fotos-talca" }, include: { config: true, channels: true } });
  const user = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
    `SELECT id, email FROM auth.users WHERE lower(email)=lower($1)`,
    "audio@visual.cl"
  );
  const profile = user[0]
    ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM public.profiles WHERE user_id = $1::uuid`,
        user[0].id
      )
    : [];
  const channel = await prisma.tenantChannel.findUnique({ where: { phoneNumberId: "1245403151983186" } });
  console.log(JSON.stringify({ tenant, user, profile, channel }, null, 2));
}

main().finally(() => prisma.$disconnect());
