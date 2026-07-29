/**
 * Vincula WhatsApp en BD (Prisma) sin llamar al API.
 * Útil cuando ECS está apagado o api.conversai.easycomp.cl no responde.
 *
 * Uso:
 *   npx tsx scripts/link-whatsapp-db.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const { encryptionService } = await import("../src/lib/encryption.service.js");

const prisma = new PrismaClient();

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const tenantId = parseArg("tenant-id", process.env.TENANT_ID ?? "tenant-twd");
  const phoneNumberId = parseArg("phone-number-id", "1245403151983186");
  const phoneNumber = parseArg("phone", "+56946867544");
  const wabaId = parseArg("waba-id", "1400503198602909");
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error("Falta META_SYSTEM_USER_ACCESS_TOKEN en el entorno (.env.production)");
  }

  const encrypted = encryptionService.encrypt(token);

  const existingForTenant = await prisma.tenantChannel.findFirst({
    where: { tenantId, channelType: "WHATSAPP_BUSINESS" }
  });

  const channel = existingForTenant
    ? await prisma.tenantChannel.update({
        where: { id: existingForTenant.id },
        data: {
          phoneNumberId,
          phoneNumber,
          wabaId,
          accessTokenEncrypted: encrypted,
          status: "ACTIVE",
          isActive: true
        }
      })
    : await prisma.tenantChannel.upsert({
        where: { phoneNumberId },
        create: {
          tenantId,
          phoneNumberId,
          phoneNumber,
          wabaId,
          accessTokenEncrypted: encrypted,
          status: "ACTIVE",
          isActive: true
        },
        update: {
          tenantId,
          phoneNumber,
          wabaId,
          accessTokenEncrypted: encrypted,
          status: "ACTIVE",
          isActive: true
        }
      });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: "ACTIVE", botGlobalEnabled: true }
  });

  console.log("OK. Canal vinculado en BD:");
  console.log(`  tenantId:       ${channel.tenantId}`);
  console.log(`  phoneNumberId:  ${channel.phoneNumberId}`);
  console.log(`  phoneNumber:    ${channel.phoneNumber}`);
  console.log("");
  console.log("Siguiente: enciende ECS y envia 'Hola' al numero desde otro WhatsApp.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
