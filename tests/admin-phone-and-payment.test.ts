import { describe, expect, it } from "vitest";
import {
  readHttpsUrl,
  readPaymentDestinationUrl,
  slugifyPaymentCode
} from "../src/modules/payments/payment-link.utils.js";
import { mergeOnboardingDraft } from "../src/modules/onboarding/setup-status.service.js";

describe("slugifyPaymentCode", () => {
  it("normaliza el sufijo del botón Pagar", () => {
    expect(slugifyPaymentCode("Pedido #1042")).toBe("pedido-1042");
    expect(slugifyPaymentCode("pedido-1042")).toBe("pedido-1042");
  });
});

describe("readPaymentDestinationUrl", () => {
  it("lee payment_url https del configJson", () => {
    expect(readPaymentDestinationUrl({ payment_url: "https://mpago.la/abc" })).toBe(
      "https://mpago.la/abc"
    );
    expect(readHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(readPaymentDestinationUrl({ payment_url: "not-a-url" })).toBeNull();
  });
});

describe("mergeOnboardingDraft phone change", () => {
  it("limpia la verificación si cambia el teléfono", () => {
    const merged = mergeOnboardingDraft(
      {
        human_contact: {
          admin_phone: "+56911111111",
          admin_phone_verified_at: "2026-09-15T00:00:00.000Z"
        }
      },
      { human_contact: { admin_phone: "+56922222222" } }
    );
    expect(merged.human_contact?.admin_phone).toBe("+56922222222");
    expect(merged.human_contact?.admin_phone_verified_at).toBeNull();
  });
});
