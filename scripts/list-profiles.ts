/**
 * Lista usuarios Auth + profiles en Supabase (tabla public.profiles de la UI).
 * Uso: npx tsx scripts/list-profiles.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();
const tenantId = process.env.TENANT_ID ?? "cmrgmk5vf0000gbngos6i7jnt";

async function main() {
  const profiles = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      user_id: string;
      business_id: string | null;
      full_name: string | null;
      role: string;
      active: boolean;
      created_at: Date;
    }>
  >(
  `SELECT id, user_id, business_id, full_name, role::text AS role, active, created_at
     FROM public.profiles
     ORDER BY created_at`,
  );

  const authUsers = await prisma.$queryRawUnsafe<
    Array<{ id: string; email: string | null; created_at: Date }>
  >(
    `SELECT id, email, created_at FROM auth.users ORDER BY created_at`,
  );

  const linked = profiles.map((p) => {
    const user = authUsers.find((u) => u.id === p.user_id);
    return {
      email: user?.email ?? "(sin email)",
      full_name: p.full_name,
      business_id: p.business_id,
      role: p.role,
      active: p.active,
      matches_pilot: p.business_id === tenantId,
    };
  });

  console.log(
    JSON.stringify(
      {
        pilotTenantId: tenantId,
        profileCount: profiles.length,
        authUserCount: authUsers.length,
        profiles: linked,
        pilotProfiles: linked.filter((p) => p.matches_pilot),
        usersWithoutProfile: authUsers
          .filter((u) => !profiles.some((p) => p.user_id === u.id))
          .map((u) => ({ email: u.email })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
