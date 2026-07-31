/**
 * Verifica en BD que delivery status DELIVERED/READ está operativo
 * y opcionalmente simula webhooks Meta statuses contra staging/prod.
 *
 * Uso:
 *   npx tsx scripts/verify-whatsapp-delivery-status.ts
 *   npx tsx scripts/verify-whatsapp-delivery-status.ts --simulate <WAMID> --status delivered
 *   npx tsx scripts/verify-whatsapp-delivery-status.ts --simulate <WAMID> --status read
 *
 * Variables: lee .env.production (DATABASE_URL, TENANT_ID, META_APP_SECRET, …)
 */
import crypto from "node:crypto";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.production"), override: true });

const prisma = new PrismaClient();

type CliArgs = {
  tenantId: string;
  baseUrl: string;
  simulateWamid: string | null;
  simulateStatus: "delivered" | "read" | "failed";
  recipientPhone: string | null;
  phoneNumberId: string | null;
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const simulateStatusRaw = get("--status") ?? "delivered";
  const simulateStatus =
    simulateStatusRaw === "read" || simulateStatusRaw === "failed"
      ? simulateStatusRaw
      : "delivered";

  return {
    tenantId: get("--tenant-id") ?? process.env.TENANT_ID ?? "",
    baseUrl: get("--base-url") ?? process.env.BOT_API_BASE_URL ?? "https://api.conversai.easycomp.cl",
    simulateWamid: get("--simulate") ?? null,
    simulateStatus,
    recipientPhone: get("--recipient") ?? null,
    phoneNumberId: get("--phone-number-id") ?? null
  };
}

function signMetaWebhook(body: string, appSecret: string): string {
  return `sha256=${crypto.createHmac("sha256", appSecret).update(body).digest("hex")}`;
}

async function checkDatabaseSchema() {
  const enumRows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'WhatsappDeliveryStatus'
    ORDER BY e.enumsortorder
  `;

  const labels = enumRows.map((row) => row.enumlabel);
  const required = ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"];
  const missing = required.filter((value) => !labels.includes(value));

  const errorColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Message'
      AND column_name IN ('whatsappDeliveryErrorCode', 'whatsappDeliveryErrorMessage')
  `;

  return {
    enumValues: labels,
    enumOk: missing.length === 0,
    missingEnumValues: missing,
    deliveryErrorColumnsOk: errorColumns.length === 2,
    deliveryErrorColumns: errorColumns.map((row) => row.column_name)
  };
}

async function checkRecentOutboundMessages(tenantId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const grouped = await prisma.message.groupBy({
    by: ["whatsappDeliveryStatus"],
    where: {
      ...(tenantId ? { tenantId } : {}),
      direction: "OUTBOUND",
      createdAt: { gte: since }
    },
    _count: { _all: true }
  });

  const recent = await prisma.message.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      direction: "OUTBOUND",
      externalId: { not: null }
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      contentText: true,
      externalId: true,
      whatsappDeliveryStatus: true,
      createdAt: true
    }
  });

  const hasDeliveredOrRead = grouped.some(
    (row) => row.whatsappDeliveryStatus === "DELIVERED" || row.whatsappDeliveryStatus === "READ"
  );

  return {
    since: since.toISOString(),
    statusCountsLast7Days: grouped.map((row) => ({
      status: row.whatsappDeliveryStatus,
      count: row._count._all
    })),
    hasDeliveredOrReadInLast7Days: hasDeliveredOrRead,
    recentOutboundWithWamid: recent
  };
}

async function resolveChannelContext(tenantId: string, phoneNumberId: string | null) {
  const channel = await prisma.tenantChannel.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(phoneNumberId ? { phoneNumberId } : {}),
      isActive: true,
      status: "ACTIVE"
    },
    include: {
      tenant: {
        include: {
          conversations: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            include: { customer: true }
          }
        }
      }
    }
  });

  if (!channel) {
    return null;
  }

  const conversation = channel.tenant.conversations[0];
  return {
    phoneNumberId: channel.phoneNumberId,
    recipientPhone: conversation?.customer?.phoneNumber ?? null
  };
}

async function simulateStatusWebhook(input: {
  baseUrl: string;
  wamid: string;
  status: "delivered" | "read" | "failed";
  phoneNumberId: string;
  recipientPhone: string;
}) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    throw new Error("META_APP_SECRET no definido en .env.production");
  }

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: input.phoneNumberId },
              statuses: [
                {
                  id: input.wamid,
                  status: input.status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: input.recipientPhone.replace(/\D/g, ""),
                  ...(input.status === "failed"
                    ? {
                        errors: [
                          {
                            code: 131026,
                            title: "Message undeliverable",
                            message: "Simulación local verify-whatsapp-delivery-status"
                          }
                        ]
                      }
                    : {})
                }
              ]
            }
          }
        ]
      }
    ]
  };

  const body = JSON.stringify(payload);
  const signature = signMetaWebhook(body, appSecret);
  const url = `${input.baseUrl.replace(/\/$/, "")}/webhooks/whatsapp`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature
    },
    body
  });

  const text = await response.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // keep raw text
  }

  return {
    url,
    httpStatus: response.status,
    response: json
  };
}

async function waitForStatusUpdate(wamid: string, expected: string, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const message = await prisma.message.findFirst({
      where: { externalId: wamid, direction: "OUTBOUND" },
      select: {
        id: true,
        whatsappDeliveryStatus: true
      }
    });

    if (message?.whatsappDeliveryStatus === expected) {
      return { ok: true as const, message, attempts: i + 1 };
    }
  }

  const message = await prisma.message.findFirst({
    where: { externalId: wamid, direction: "OUTBOUND" },
    select: {
      id: true,
      whatsappDeliveryStatus: true
    }
  });

  return { ok: false as const, message, attempts };
}

async function main() {
  const args = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no definido. Usa .env.production o exporta la variable.");
    process.exit(1);
  }

  const schema = await checkDatabaseSchema();
  const messages = await checkRecentOutboundMessages(args.tenantId);
  const channel = await resolveChannelContext(args.tenantId, args.phoneNumberId);

  const report: Record<string, unknown> = {
    ok: schema.enumOk,
    tenantId: args.tenantId || "(todos)",
    baseUrl: args.baseUrl,
    schema,
    messages,
    channel,
    hints: [] as string[]
  };

  if (!schema.enumOk) {
    (report.hints as string[]).push(
      `Falta migración 20260728180000: valores ausentes ${schema.missingEnumValues.join(", ")}`
    );
  }

  if (!schema.deliveryErrorColumnsOk) {
    (report.hints as string[]).push(
      "Falta migración 20260731180000_whatsapp_delivery_error (columnas de error en FAILED)"
    );
  }

  if (!messages.hasDeliveredOrReadInLast7Days) {
    (report.hints as string[]).push(
      "En 7 días no hay OUTBOUND con DELIVERED/READ. Puede ser normal si el worker no corre o nadie abrió WhatsApp."
    );
  }

  if (!process.env.REDIS_URL) {
    (report.hints as string[]).push("REDIS_URL no definido localmente (el worker en ECS sí debe tenerlo).");
  }

  if (args.simulateWamid) {
    if (!channel?.phoneNumberId) {
      throw new Error("No se encontró canal activo. Pasa --phone-number-id y --recipient.");
    }

    const recipientPhone = args.recipientPhone ?? channel.recipientPhone;
    if (!recipientPhone) {
      throw new Error("Pasa --recipient con el teléfono del cliente (solo dígitos o E.164).");
    }

    const before = await prisma.message.findFirst({
      where: { externalId: args.simulateWamid, direction: "OUTBOUND" },
      select: { id: true, whatsappDeliveryStatus: true }
    });

    const webhook = await simulateStatusWebhook({
      baseUrl: args.baseUrl,
      wamid: args.simulateWamid,
      status: args.simulateStatus,
      phoneNumberId: args.phoneNumberId ?? channel.phoneNumberId,
      recipientPhone
    });

    const expectedStatus =
      args.simulateStatus === "delivered"
        ? "DELIVERED"
        : args.simulateStatus === "read"
          ? "READ"
          : "FAILED";

    const after = await waitForStatusUpdate(args.simulateWamid, expectedStatus);

    report.simulation = {
      wamid: args.simulateWamid,
      requestedStatus: args.simulateStatus,
      expectedEnum: expectedStatus,
      before,
      webhook,
      after,
      workerLikelyOk: after.ok
    };

    if (!after.ok) {
      (report.hints as string[]).push(
        "Tras simular webhook, el estado en BD no cambió. Revisa worker ECS, REDIS_URL y logs 'Message worker'."
      );
      report.ok = false;
    }
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
