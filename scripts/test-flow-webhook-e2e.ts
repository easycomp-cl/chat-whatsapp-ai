/**
 * Prueba E2E: quote.confirmed → webhook saliente firmado.
 *
 * Uso:
 *   npx tsx scripts/test-flow-webhook-e2e.ts
 *   npx tsx scripts/test-flow-webhook-e2e.ts --use-queue   # requiere npm run dev:workers
 *
 * Variables (.env):
 *   TENANT_ID, INTERNAL_API_KEY, DATABASE_URL
 *   npx tsx scripts/test-flow-webhook-e2e.ts --via-api   # además prueba PUT HTTP (API en :3000)
 */
import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  ConversationMode,
  ConversationStatus,
  FlowWebhookDeliveryStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { normalizePhone } from "../src/utils/phone.js";
import { flowQuoteService } from "../src/modules/flows/flow-quote.service.js";
import { flowWebhookDeliveryService } from "../src/modules/flows/flow-webhook-delivery.service.js";
import { flowWebhookIntegrationService } from "../src/modules/flows/flow-webhook-integration.service.js";
import { verifyChatBotManagerOutboundSignature } from "../src/modules/flows/flow-webhook-outbound.utils.js";
import { createWoodQuoteFlowGraph } from "../src/modules/flows/domain/flow-defaults.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const tenantId = process.env.TENANT_ID ?? "tenant-twd";
const apiBaseUrl = (process.env.BOT_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const apiKey = process.env.INTERNAL_API_KEY ?? "easycomp_internal_api_key_dev";
const useQueue = process.argv.includes("--use-queue");
const viaApi = process.argv.includes("--via-api");
const keepData = process.argv.includes("--keep-data");

const TEST_PHONE = "+56900008877";
const TEST_FLOW_NAME = "E2E Webhook Quote Test";

type ReceivedWebhook = {
  headers: http.IncomingHttpHeaders;
  body: string;
};

function log(step: string, detail?: unknown) {
  console.log(`\n▶ ${step}`);
  if (detail !== undefined) {
    console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
}

function startLocalReceiver(): Promise<{
  url: string;
  close: () => Promise<void>;
  waitForRequest: Promise<ReceivedWebhook>;
}> {
  return new Promise((resolve, reject) => {
    let resolveRequest: ((value: ReceivedWebhook) => void) | null = null;
    const waitForRequest = new Promise<ReceivedWebhook>((resolve) => {
      resolveRequest = resolve;
    });

    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolveRequest?.({
          headers: req.headers,
          body
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/chatbotmanager-webhook-test`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
        waitForRequest
      });
    });
  });
}

async function configureIntegration(receiverUrl: string, secret: string) {
  if (viaApi) {
    const res = await fetch(`${apiBaseUrl}/businesses/${tenantId}/integrations/flow-webhook`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey
      },
      body: JSON.stringify({
        url: receiverUrl,
        enabled: true,
        events: ["quote.confirmed"],
        webhook_secret: secret
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`API integración falló (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  return flowWebhookIntegrationService.upsertIntegration(tenantId, {
    url: receiverUrl,
    enabled: true,
    events: ["quote.confirmed"],
    webhook_secret: secret
  });
}

async function ensureTestConversation() {
  const channel = await prisma.tenantChannel.findFirst({
    where: { tenantId, isActive: true, status: "ACTIVE" }
  });
  if (!channel) {
    throw new Error(`No hay canal WhatsApp activo para tenant ${tenantId}`);
  }

  const customer = await prisma.customer.upsert({
    where: {
      tenantId_phoneNumber: {
        tenantId,
        phoneNumber: normalizePhone(TEST_PHONE)
      }
    },
    create: {
      tenantId,
      phoneNumber: normalizePhone(TEST_PHONE),
      name: "Cliente E2E Webhook"
    },
    update: {
      name: "Cliente E2E Webhook"
    }
  });

  let conversation = await prisma.conversation.findFirst({
    where: {
      tenantId,
      customerId: customer.id,
      activeFlowRunId: null,
      status: { in: [ConversationStatus.OPEN, ConversationStatus.PENDING] }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId,
        customerId: customer.id,
        channelPhoneNumber: normalizePhone(channel.phoneNumber),
        status: ConversationStatus.OPEN,
        mode: ConversationMode.BOT
      }
    });
  }

  return { customer, conversation };
}

async function ensurePublishedFlow() {
  const existing = await prisma.flowDefinition.findFirst({
    where: { tenantId, status: "ACTIVE", currentVersionId: { not: null } },
    include: { currentVersion: true },
    orderBy: { updatedAt: "desc" }
  });
  if (existing?.currentVersion) {
    return existing;
  }

  const named = await prisma.flowDefinition.findFirst({
    where: { tenantId, name: TEST_FLOW_NAME },
    include: { currentVersion: true }
  });
  if (named?.currentVersion?.status === "PUBLISHED") {
    return named;
  }

  const admin = await prisma.tenantAdmin.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { isPrimary: "desc" }
  });
  if (!admin) {
    throw new Error(`No hay TenantAdmin activo para ${tenantId}`);
  }

  log("Bootstrap flujo de prueba (Prisma directo)", TEST_FLOW_NAME);
  const graph = createWoodQuoteFlowGraph(TEST_FLOW_NAME);

  const flow = await prisma.$transaction(async (tx) => {
    const createdFlow = await tx.flowDefinition.create({
      data: {
        tenantId,
        name: TEST_FLOW_NAME,
        description: "Flujo temporal para test E2E webhook",
        status: "ACTIVE",
        createdByAdminId: admin.id,
        updatedByAdminId: admin.id
      }
    });

    const version = await tx.flowVersion.create({
      data: {
        tenantId,
        flowDefinitionId: createdFlow.id,
        versionNumber: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
        graphJson: graph as Prisma.InputJsonValue,
        createdByAdminId: admin.id
      }
    });

    await tx.flowTrigger.create({
      data: {
        tenantId,
        flowVersionId: version.id,
        triggerType: "MANUAL",
        priority: 100,
        configurationJson: {},
        isEnabled: true
      }
    });

    return tx.flowDefinition.update({
      where: { id: createdFlow.id },
      data: { currentVersionId: version.id },
      include: { currentVersion: true }
    });
  });

  return flow;
}

async function waitForDeliveryStatus(
  deliveryId: string,
  expected: FlowWebhookDeliveryStatus,
  timeoutMs = 30_000
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const delivery = await prisma.flowWebhookDelivery.findUnique({ where: { id: deliveryId } });
    if (delivery?.status === expected) {
      return delivery;
    }
    if (delivery?.status === FlowWebhookDeliveryStatus.DEAD_LETTER) {
      throw new Error(`Entrega en DEAD_LETTER: ${delivery.lastError ?? "sin detalle"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout esperando estado ${expected} en delivery ${deliveryId}`);
}

async function main() {
  log("Configuración", { tenantId, useQueue, viaApi, apiBaseUrl });

  const webhookSecret = randomBytes(24).toString("hex");
  const receiver = await startLocalReceiver();
  log("Receptor local", receiver.url);

  let runId: string | null = null;
  let runEventId: string | null = null;
  let deliveryId: string | null = null;

  try {
    log(viaApi ? "Configurando integración FLOW_WEBHOOK vía API" : "Configurando integración FLOW_WEBHOOK (servicio directo)");
    await configureIntegration(receiver.url, webhookSecret);

    const { customer, conversation } = await ensureTestConversation();
    const flow = await ensurePublishedFlow();
    const version = flow.currentVersion;
    if (!version) {
      throw new Error("Flujo sin versión publicada");
    }

    log("Datos de prueba", {
      customerId: customer.id,
      conversationId: conversation.id,
      flowId: flow.id,
      flowVersionId: version.id
    });

    const variables = {
      "product.type": "Tabla parrillera",
      "product.wood": "raulí",
      "product.size": "40x25",
      "product.quantity": 8,
      "engraving.type": "text",
      "engraving.text": "Familia Pérez",
      "delivery.method": "delivery",
      "delivery.commune": "Talca",
      "delivery.region": "Maule",
      "delivery.requiredDate": "2026-08-31"
    };

    const quote = await flowQuoteService.calculateQuote({
      tenantId,
      customerId: customer.id,
      variables,
      config: { useCatalog: true, useDelivery: true, fallbackUnitPrice: 32_000 }
    });

    const run = await prisma.flowRun.create({
      data: {
        tenantId,
        flowVersionId: version.id,
        conversationId: conversation.id,
        customerId: customer.id,
        currentNodeId: "emit-quote",
        status: "COMPLETED",
        variablesJson: variables as Prisma.InputJsonValue,
        startedBy: "SYSTEM"
      }
    });
    runId = run.id;

    const payload = flowQuoteService.buildQuoteConfirmedPayload({
      tenantId,
      conversationId: conversation.id,
      customerId: customer.id,
      flowDefinitionId: flow.id,
      flowVersion: version.versionNumber,
      runId: run.id,
      quote,
      customer: {
        name: customer.name,
        phone: customer.phoneNumber,
        email: customer.email
      },
      confirmed: true
    });

    const runEvent = await prisma.flowRunEvent.create({
      data: {
        tenantId,
        flowRunId: run.id,
        nodeId: "emit-quote",
        eventType: "quote.confirmed",
        payloadJson: payload as Prisma.InputJsonValue
      }
    });
    runEventId = runEvent.id;

    log("Programando entrega webhook");
    const delivery = await flowWebhookDeliveryService.scheduleFromFlowEvent({
      tenantId,
      flowRunId: run.id,
      flowRunEventId: runEvent.id,
      nodeId: "emit-quote",
      eventType: "quote.confirmed",
      payload,
      nodeConfig: { eventType: "quote.confirmed" }
    });

    if (!delivery) {
      throw new Error("No se creó la entrega (¿integración deshabilitada o sin secreto?)");
    }
    deliveryId = delivery.id;

    log("Delivery creado", { deliveryId: delivery.id, targetUrl: delivery.targetUrl });

    const receivePromise = receiver.waitForRequest;

    if (useQueue) {
      log("Modo cola: esperando worker flow-webhook-delivery (npm run dev:workers)");
      await waitForDeliveryStatus(delivery.id, FlowWebhookDeliveryStatus.DELIVERED);
    } else {
      log("Modo directo: ejecutando entrega sin worker");
      await flowWebhookDeliveryService.executeDelivery(delivery.id);
    }

    const received = await Promise.race([
      receivePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout esperando webhook en receptor local")), 10_000)
      )
    ]);

    const signature = received.headers["x-chatbotmanager-signature"];
    const timestamp = received.headers["x-chatbotmanager-timestamp"];
    const eventHeader = received.headers["x-chatbotmanager-event"];
    const deliveryHeader = received.headers["x-chatbotmanager-delivery-id"];

    const signatureOk = verifyChatBotManagerOutboundSignature({
      rawBody: received.body,
      signatureHeader: typeof signature === "string" ? signature : undefined,
      timestampHeader: typeof timestamp === "string" ? timestamp : undefined,
      secret: webhookSecret
    });

    if (!signatureOk) {
      throw new Error("Firma HMAC del webhook recibido inválida");
    }

    const parsedBody = JSON.parse(received.body) as {
      eventType?: string;
      quote?: { pricing?: { total?: number } };
    };

    log("Webhook recibido OK", {
      event: eventHeader,
      deliveryId: deliveryHeader,
      signatureValid: signatureOk,
      eventType: parsedBody.eventType,
      quoteTotal: parsedBody.quote?.pricing?.total ?? null
    });

    const finalDelivery = await prisma.flowWebhookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
      include: { attempts: { orderBy: { attemptNumber: "asc" } } }
    });

    log("Estado final delivery", {
      status: finalDelivery.status,
      attempts: finalDelivery.attempts.map((a) => ({
        n: a.attemptNumber,
        httpStatus: a.httpStatus,
        error: a.errorMessage
      }))
    });

    if (finalDelivery.status !== FlowWebhookDeliveryStatus.DELIVERED) {
      throw new Error(`Delivery no quedó en DELIVERED (${finalDelivery.status})`);
    }

    if (parsedBody.eventType !== "quote.confirmed") {
      throw new Error(`eventType inesperado: ${parsedBody.eventType}`);
    }

    console.log("\n✅ E2E webhook quote.confirmed completado correctamente");

    if (!keepData && deliveryId && runEventId && runId) {
      await prisma.flowWebhookDeliveryAttempt.deleteMany({ where: { deliveryId } });
      await prisma.flowWebhookDelivery.delete({ where: { id: deliveryId } });
      await prisma.flowRunEvent.delete({ where: { id: runEventId } });
      await prisma.flowRun.delete({ where: { id: runId } });
      log("Limpieza", "run, event y delivery de prueba eliminados (--keep-data para conservar)");
    }
  } catch (error) {
    console.error("\n❌ E2E falló:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    await receiver.close();
    await prisma.$disconnect();
    if (process.exitCode === 1) {
      process.exit(1);
    }
  }
}

main().catch(async (error) => {
  console.error("\n❌ E2E falló (fatal):", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
