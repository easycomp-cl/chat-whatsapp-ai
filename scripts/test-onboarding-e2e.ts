/**
 * Prueba E2E onboarding: draft → complete → FAQs + documento RAG.
 *
 * Uso:
 *   npx tsx scripts/test-onboarding-e2e.ts
 *   npx tsx scripts/test-onboarding-e2e.ts --via-api   # requiere API en :3000
 *   npx tsx scripts/test-onboarding-e2e.ts --keep-data
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, KnowledgeDocumentStatus } from "@prisma/client";
import { onboardingService } from "../src/modules/onboarding/onboarding.service.js";
import {
  ONBOARDING_PROFILE_DOCUMENT_TITLE,
  ONBOARDING_SEED_FAQ_CATEGORY
} from "../src/modules/onboarding/business-profile.builder.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const apiBaseUrl = (process.env.BOT_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const apiKey = process.env.INTERNAL_API_KEY ?? "easycomp_internal_api_key_dev";
const viaApi = process.argv.includes("--via-api");
const keepData = process.argv.includes("--keep-data");

const prisma = new PrismaClient();

const SAMPLE_DRAFT = {
  identity: {
    business_name: "Panadería E2E Test",
    business_type: "products" as const,
    description:
      "Panadería artesanal en Santiago especializada en pan amasado, empanadas y pasteles horneados cada día."
  },
  offerings: [
    {
      type: "product" as const,
      name: "Pan amasado",
      description: "Pan tradicional horneado diario con ingredientes naturales",
      price: 1200,
      currency: "CLP"
    }
  ],
  operations: {
    schedule: "Lun–Vie 8:00–20:00, Sáb 9:00–14:00",
    city: "Santiago",
    commune: "Providencia",
    address: "Av. Providencia 1234",
    payment_methods: ["efectivo", "transferencia", "tarjeta"],
    delivery_notes: "Despacho en Región Metropolitana"
  },
  human_contact: {
    admin_name: "María Test",
    admin_phone: "+56900007788",
    notify_on_handoff: true
  },
  bot_identity: {
    use_named_agent: true,
    bot_name: "Sol Test",
    bot_tone: "profesional y cercano",
    greeting_message: "Hola, soy Sol de Panadería E2E Test."
  }
};

function log(step: string, detail?: unknown) {
  console.log(`\n▶ ${step}`);
  if (detail !== undefined) {
    console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
}

async function apiFetch(method: string, path: string, body?: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

async function createTestTenant() {
  const slug = `e2e-onboarding-${Date.now()}`;
  return prisma.tenant.create({
    data: {
      name: "Panadería E2E Test",
      slug,
      botGlobalEnabled: false,
      metadataJson: onboardingService.ensureInitialSetupMetadata(null),
      config: {
        create: {
          botName: "Sol",
          botTone: "profesional y cercano",
          greetingMessage: "Hola, soy Sol.",
          fallbackMessage: "No tengo esa información confirmada todavía.",
          handoffMessage: "Te conecto con un asesor en breve.",
          outOfHoursMessage: "Estamos fuera de horario."
        }
      }
    }
  });
}

async function runServiceFlow(tenantId: string) {
  log("PATCH draft (service)");
  const afterPatch = await onboardingService.patchDraft(tenantId, SAMPLE_DRAFT);
  if (!afterPatch) throw new Error("patchDraft returned null");

  log("setup-status tras PATCH", {
    progress_percent: afterPatch.progress_percent,
    can_go_live: afterPatch.can_go_live,
    missing: afterPatch.missing_for_go_live
  });

  if (!afterPatch.can_go_live) {
    throw new Error(`Expected can_go_live true, missing: ${afterPatch.missing_for_go_live.join(", ")}`);
  }

  log("POST complete (service)");
  const complete = await onboardingService.complete({
    tenantId,
    enableBot: true,
    handoffOnLowConfidence: true
  });

  if ("error" in complete) {
    throw new Error(`complete failed: ${complete.error}`);
  }

  log("complete result", complete);
  return complete;
}

async function runApiFlow(tenantId: string) {
  log("PATCH onboarding (HTTP)", { url: `${apiBaseUrl}/businesses/${tenantId}/onboarding` });
  const patch = await apiFetch("PATCH", `/businesses/${tenantId}/onboarding`, SAMPLE_DRAFT);
  if (patch.status !== 200) throw new Error(`PATCH failed: ${patch.status} ${JSON.stringify(patch.json)}`);

  log("GET setup-status (HTTP)");
  const status = await apiFetch("GET", `/businesses/${tenantId}/setup-status`);
  if (status.status !== 200) throw new Error(`GET setup-status failed: ${status.status}`);

  const statusBody = status.json as { can_go_live?: boolean };
  if (!statusBody.can_go_live) {
    throw new Error(`can_go_live false via API: ${JSON.stringify(status.json)}`);
  }

  log("POST complete (HTTP)");
  const complete = await apiFetch("POST", `/businesses/${tenantId}/onboarding/complete`, {
    enable_bot: true,
    handoff_on_low_confidence: true
  });
  if (complete.status !== 200) {
    throw new Error(`POST complete failed: ${complete.status} ${JSON.stringify(complete.json)}`);
  }

  log("complete via API", complete.json);
}

async function verifyArtifacts(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { config: true }
  });
  if (!tenant?.config) throw new Error("tenant config missing");

  log("tenant.botGlobalEnabled", tenant.botGlobalEnabled);
  if (!tenant.botGlobalEnabled) throw new Error("bot should be enabled after complete");

  const configJson = tenant.config.configJson as Record<string, unknown>;
  log("handoff_on_low_confidence", configJson.handoff_on_low_confidence);
  if (configJson.handoff_on_low_confidence !== true) {
    throw new Error("expected handoff_on_low_confidence true");
  }

  const faqCount = await prisma.tenantFaq.count({
    where: { tenantId, category: ONBOARDING_SEED_FAQ_CATEGORY, isActive: true }
  });
  log("seed FAQs count", faqCount);
  if (faqCount < 5) throw new Error(`expected >= 5 seed FAQs, got ${faqCount}`);

  const profileDoc = await prisma.tenantDocument.findFirst({
    where: { tenantId, title: ONBOARDING_PROFILE_DOCUMENT_TITLE }
  });
  if (!profileDoc?.rawText?.includes("Pan amasado")) {
    throw new Error("profile document missing or incomplete");
  }
  log("profile document", {
    id: profileDoc.id,
    status: profileDoc.status,
    bytes: profileDoc.rawText.length
  });

  const admin = await prisma.tenantAdmin.findFirst({
    where: { tenantId, phoneNumber: SAMPLE_DRAFT.human_contact.admin_phone }
  });
  if (!admin) throw new Error("primary admin not created");

  return { profileDoc };
}

async function waitForIndexing(documentId: string, maxMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const doc = await prisma.tenantDocument.findUnique({ where: { id: documentId } });
    if (doc?.status === KnowledgeDocumentStatus.INDEXED) {
      log("document indexed", { documentId, elapsedMs: Date.now() - start });
      return true;
    }
    if (doc?.status === KnowledgeDocumentStatus.FAILED) {
      throw new Error(`index failed: ${doc.indexError}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  log("indexing still pending (worker may be off)", { documentId });
  return false;
}

async function main() {
  process.env.ALLOW_GO_LIVE_WITHOUT_CHANNEL = "true";

  const tenant = await createTestTenant();
  log("created tenant", { id: tenant.id, slug: tenant.slug });

  try {
    if (viaApi) {
      await runApiFlow(tenant.id);
    } else {
      await runServiceFlow(tenant.id);
    }

    const { profileDoc } = await verifyArtifacts(tenant.id);

    if (!viaApi) {
      log("waiting for knowledge index (optional, needs worker)");
      await waitForIndexing(profileDoc.id);
    }

    console.log("\n✅ Onboarding E2E OK");
  } finally {
    if (!keepData) {
      await prisma.tenant.delete({ where: { id: tenant.id } });
      log("cleaned up test tenant");
    } else {
      log("kept tenant for manual inspection", { id: tenant.id });
    }
  }
}

main()
  .catch((error) => {
    console.error("\n❌ Onboarding E2E FAILED");
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
