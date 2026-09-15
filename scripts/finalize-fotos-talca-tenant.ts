import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const TENANT_ID = "cmsny237l000012d4g8omudmq";
const USER_ID = "53648c70-9346-48ed-b9e2-5afab6c21899";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    `UPDATE public.profiles
     SET business_id = $1,
         role = $2::public.user_role,
         active = true,
         full_name = $3,
         updated_at = now()
     WHERE user_id = $4::uuid`,
    TENANT_ID,
    "BUSINESS_ADMIN",
    "Admin Fotos Talca",
    USER_ID
  );

  const existingAdmin = await prisma.tenantAdmin.findFirst({ where: { tenantId: TENANT_ID } });
  if (!existingAdmin) {
    await prisma.tenantAdmin.create({
      data: {
        tenantId: TENANT_ID,
        name: "Admin Fotos Talca",
        phoneNumber: "+56946867544",
        isPrimary: true,
        notifyOnHandoff: true,
        role: "collaborator"
      }
    });
  }

  const profile = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT business_id, role::text AS role, active, full_name FROM public.profiles WHERE user_id = $1::uuid`,
    USER_ID
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant_id: TENANT_ID,
        login: { email: "audio@visual.cl", password: "123456" },
        profile: profile[0],
        faq_count: await prisma.tenantFaq.count({ where: { tenantId: TENANT_ID } }),
        whatsapp: await prisma.tenantChannel.findFirst({ where: { tenantId: TENANT_ID } })
      },
      null,
      2
    )
  );
}

main().finally(() => prisma.$disconnect());
