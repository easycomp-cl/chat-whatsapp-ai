import { describe, expect, it } from "vitest";
import { isFoundationalBusinessQuestion } from "../src/modules/runtime/foundational-intent.js";
import { resolveHandoffCustomerMessage } from "../src/modules/runtime/handoff-message.resolver.js";
import {
  countConsecutiveSoftFallbacks,
  isSoftFallbackBotText
} from "../src/modules/runtime/conversation-escalation-state.js";
import { buildBusinessProfileDocument, buildSeedFaqs } from "../src/modules/onboarding/business-profile.builder.js";
import { buildSetupStatus, computeChecklist } from "../src/modules/onboarding/setup-status.service.js";

describe("foundational intent", () => {
  it("detects what do you sell questions", () => {
    expect(isFoundationalBusinessQuestion("que venden?")).toBe(true);
    expect(isFoundationalBusinessQuestion("hola")).toBe(false);
  });
});

describe("handoff messages", () => {
  it("uses empathetic copy for frustration", () => {
    const message = resolveHandoffCustomerMessage({
      reason: "customer_frustrated",
      businessName: "Panadería Sol",
      defaultHandoffMessage: "default"
    });
    expect(message).toContain("molestia");
  });
});

describe("soft fallback state", () => {
  it("detects fallback bot text", () => {
    expect(isSoftFallbackBotText("No tengo esa información confirmada todavía.")).toBe(true);
  });

  it("counts consecutive fallbacks", () => {
    expect(
      countConsecutiveSoftFallbacks([
        "No tengo esa información confirmada todavía.",
        "No tengo esa información confirmada todavía."
      ])
    ).toBe(2);
  });
});

describe("onboarding builders", () => {
  const draft = {
    identity: {
      business_name: "Panadería Sol",
      business_type: "products" as const,
      description: "Panadería artesanal en Santiago con productos horneados todos los días."
    },
    offerings: [
      {
        type: "product" as const,
        name: "Pan amasado",
        description: "Pan tradicional horneado diario",
        price: 1200,
        currency: "CLP"
      }
    ],
    operations: {
      schedule: "Lun–Vie 8:00–20:00",
      city: "Santiago",
      payment_methods: ["efectivo", "transferencia"]
    }
  };

  it("builds profile document with offerings", () => {
    const doc = buildBusinessProfileDocument({ businessName: "Panadería Sol", draft });
    expect(doc).toContain("Pan amasado");
    expect(doc).toContain("efectivo");
  });

  it("builds seed faqs including price faq", () => {
    const faqs = buildSeedFaqs({ businessName: "Panadería Sol", draft });
    expect(faqs.some((f) => f.question.includes("venden"))).toBe(true);
    expect(faqs.some((f) => f.question.includes("Pan amasado"))).toBe(true);
  });

  it("computes checklist progress", () => {
    const checklist = computeChecklist({
      draft,
      hasActiveWhatsappChannel: false,
      hasPrimaryAdmin: true,
      tenantBotName: "Sol"
    });
    const status = buildSetupStatus({
      setup: {
        version: 1,
        started_at: new Date().toISOString(),
        draft,
        checklist: {}
      },
      checklist,
      botGlobalEnabled: false,
      allowGoLiveWithoutChannel: true
    });
    expect(status.progress_percent).toBeGreaterThan(0);
    expect(status.checklist.identity.done).toBe(true);
  });
});
