/**
 * Estado del piloto para prueba E2E.
 * Uso: npx tsx scripts/check-pilot-readiness.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const tenantId = process.env.TENANT_ID ?? "cmrgmk5vf0000gbngos6i7jnt";
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      channels: true,
      config: true,
      faqs: { where: { isActive: true }, take: 5 },
      admins: { where: { isActive: true } },
      conversations: { take: 5, orderBy: { updatedAt: "desc" } },
    },
  });

  if (!tenant) {
    console.log(JSON.stringify({ error: "tenant not found", tenantId }, null, 2));
    return;
  }

  const faqCount = await prisma.tenantFaq.count({
    where: { tenantId, isActive: true },
  });

  console.log(
    JSON.stringify(
      {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          botGlobalEnabled: tenant.botGlobalEnabled,
        },
        channel: tenant.channels[0]
          ? {
              phoneNumberId: tenant.channels[0].phoneNumberId,
              phoneNumber: tenant.channels[0].phoneNumber,
              status: tenant.channels[0].status,
              hasToken: Boolean(tenant.channels[0].accessTokenEncrypted),
            }
          : null,
        config: tenant.config
          ? {
              botName: tenant.config.botName,
              greetingMessage: tenant.config.greetingMessage?.slice(0, 80),
            }
          : null,
        faqCount,
        sampleFaqs: tenant.faqs.map((f) => f.question),
        admins: tenant.admins.map((a) => ({
          name: a.name,
          phone: a.phoneNumber,
          notifyOnHandoff: a.notifyOnHandoff,
        })),
        recentConversations: tenant.conversations.map((c) => ({
          id: c.id,
          status: c.status,
          updatedAt: c.updatedAt,
        })),
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
