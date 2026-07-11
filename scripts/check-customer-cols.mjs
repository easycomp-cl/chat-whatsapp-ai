import { PrismaClient } from "@prisma/client";

async function cols(url, label) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  const rows = await p.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Customer'
    ORDER BY 1
  `;
  console.log(label, rows.map((x) => x.column_name));
  await p.$disconnect();
}

await cols("postgresql://postgres:postgres@127.0.0.1:54332/postgres", "54332");
await cols("postgresql://postgres:postgres@localhost:5432/whatsapp_ai_saas", "5432");
