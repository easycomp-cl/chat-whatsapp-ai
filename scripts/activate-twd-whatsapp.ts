/**
 * Activa TWD como tenant de WhatsApp para pruebas:
 * - Mueve el canal real de Meta desde Panadería Sol (si existe) hacia tenant-twd
 * - Deja Panadería Sol con un canal placeholder para conservar su data de KB/FAQs
 */
import { PrismaClient } from "@prisma/client";

const TWD_TENANT_ID = "tenant-twd";
const PANADERIA_TENANT_ID = "tenant-panaderia-sol";
const PLACEHOLDER_PHONE_NUMBER_ID = "business-phone-id-1";
const PLACEHOLDER_PHONE = "+56970000001";

const prisma = new PrismaClient();

async function main() {
  const panaderiaChannel = await prisma.tenantChannel.findFirst({
    where: {
      tenantId: PANADERIA_TENANT_ID,
      phoneNumberId: { not: PLACEHOLDER_PHONE_NUMBER_ID }
    }
  });

  if (!panaderiaChannel) {
    console.log("No hay canal real de Meta en Panadería Sol; TWD conserva su configuración actual.");
    return;
  }

  const twdPlaceholder = await prisma.tenantChannel.findFirst({
    where: { tenantId: TWD_TENANT_ID, phoneNumberId: "business-phone-id-4" }
  });
  if (twdPlaceholder) {
    await prisma.tenantChannel.delete({ where: { id: twdPlaceholder.id } });
    console.log("Eliminado canal placeholder de TWD (business-phone-id-4).");
  }

  await prisma.tenantChannel.update({
    where: { id: panaderiaChannel.id },
    data: {
      tenantId: TWD_TENANT_ID,
      isActive: true,
      status: "ACTIVE"
    }
  });
  console.log(
    `Canal WhatsApp ${panaderiaChannel.phoneNumber} (${panaderiaChannel.phoneNumberId}) asignado a ${TWD_TENANT_ID}.`
  );

  const panaderiaHasPlaceholder = await prisma.tenantChannel.findFirst({
    where: { tenantId: PANADERIA_TENANT_ID, phoneNumberId: PLACEHOLDER_PHONE_NUMBER_ID }
  });
  if (!panaderiaHasPlaceholder) {
    await prisma.tenantChannel.create({
      data: {
        tenantId: PANADERIA_TENANT_ID,
        channelType: "WHATSAPP_BUSINESS",
        phoneNumber: PLACEHOLDER_PHONE,
        phoneNumberId: PLACEHOLDER_PHONE_NUMBER_ID,
        status: "INACTIVE",
        isActive: false
      }
    });
    console.log(`Panadería Sol quedó con canal placeholder inactivo (${PLACEHOLDER_PHONE_NUMBER_ID}).`);
  }

  await prisma.tenant.update({
    where: { id: TWD_TENANT_ID },
    data: { status: "ACTIVE", botGlobalEnabled: true }
  });
  console.log("TWD activo para pruebas por WhatsApp.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
