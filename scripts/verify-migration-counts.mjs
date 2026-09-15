import { PrismaClient } from "@prisma/client";

const url = process.env.NEW_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Define NEW_DATABASE_URL o DATABASE_URL");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url } } });

const [tenants, messages, chunks, authUsers, profiles] = await Promise.all([
  db.tenant.count(),
  db.message.count(),
  db.knowledgeChunk.count(),
  db.$queryRaw`SELECT COUNT(*)::int AS c FROM auth.users`,
  db.$queryRaw`SELECT business_id, active, role::text AS role FROM public.profiles LIMIT 1`
]);

console.log({
  tenants,
  messages,
  chunks,
  authUsers: authUsers[0]?.c ?? 0,
  profile: profiles[0] ?? null
});

await db.$disconnect();
