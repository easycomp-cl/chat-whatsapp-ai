import { describe, expect, it } from "vitest";
import {
  mergeInboundMediaIngestFailed,
  mergeInboundMediaIngestSucceeded,
  readInboundMediaIngestState
} from "../src/utils/inbound-media-ingest-state.js";
import { WhatsappDeliveryStatus } from "@prisma/client";
import {
  classifyWhatsappDeliveryError,
  formatWhatsappDeliveryErrorMessage,
  parseGraphApiErrorBody,
  parseWhatsappDeliveryErrors,
  userFacingWhatsappDeliveryErrorMessage
} from "../src/utils/whatsapp-delivery-error.js";
import { shouldUpgradeWhatsappDeliveryStatus } from "../src/utils/whatsapp-delivery-status.js";

describe("inbound media ingest state", () => {
  it("marks and clears failed inbound media state in rawPayloadJson", () => {
    const failed = mergeInboundMediaIngestFailed({}, "timeout de descarga");
    expect(readInboundMediaIngestState(failed)).toEqual({
      failed: true,
      error: "timeout de descarga"
    });

    const cleared = mergeInboundMediaIngestSucceeded(failed);
    expect(readInboundMediaIngestState(cleared)).toEqual({
      failed: false,
      error: null
    });
  });
});

describe("whatsapp delivery error utils", () => {
  it("parses Meta status errors", () => {
    expect(
      parseWhatsappDeliveryErrors([
        {
          code: 131026,
          title: "Message undeliverable",
          message: "Recipient is not a valid WhatsApp user"
        }
      ])
    ).toEqual({
      code: 131026,
      title: "Message undeliverable",
      message: "Recipient is not a valid WhatsApp user"
    });
  });

  it("prefers Meta error_data.details over the short title", () => {
    expect(
      parseWhatsappDeliveryErrors([
        {
          code: 131042,
          title: "Business eligibility payment issue",
          message: "Business eligibility payment issue",
          error_data: {
            details:
              "Message failed to send because your WhatsApp Business account currency is not configured."
          }
        }
      ])
    ).toEqual({
      code: 131042,
      title: "Business eligibility payment issue",
      message:
        "Message failed to send because your WhatsApp Business account currency is not configured."
    });
  });

  it("classifies Meta billing failures for templates", () => {
    expect(
      classifyWhatsappDeliveryError(
        131042,
        "currency is not configured CHANGE_COUNTRY_CURRENCY"
      )
    ).toBe("billing_currency");
    expect(
      classifyWhatsappDeliveryError(131042, "Please add a payment method")
    ).toBe("billing_payment_method");
    expect(
      classifyWhatsappDeliveryError(131042, "insufficient prepaid balance")
    ).toBe("billing_insufficient_funds");
    expect(classifyWhatsappDeliveryError(131042, "Business eligibility payment issue")).toBe(
      "billing"
    );
    expect(classifyWhatsappDeliveryError(131047, "Re-engagement message")).toBe(
      "reengagement_window"
    );
  });

  it("formats delivery error message", () => {
    expect(
      formatWhatsappDeliveryErrorMessage({
        code: 131026,
        title: "Message undeliverable",
        message: "Recipient is not a valid WhatsApp user"
      })
    ).toBe(
      "No se pudo entregar: el número no tiene WhatsApp o no puede recibir este mensaje."
    );
    expect(
      userFacingWhatsappDeliveryErrorMessage({
        code: 131042,
        title: "Business eligibility payment issue",
        message: "WhatsApp Business account currency is not configured"
      })
    ).toContain("moneda de facturación");
  });

  it("parses Graph API send error body", () => {
    expect(
      parseGraphApiErrorBody(
        JSON.stringify({
          error: {
            code: 190,
            message: "Error validating access token"
          }
        })
      )
    ).toEqual({
      code: 190,
      message: "Error validating access token"
    });
  });
});

describe("whatsapp delivery status upgrades", () => {
  it("applies FAILED after Graph already marked the message SENT", () => {
    expect(
      shouldUpgradeWhatsappDeliveryStatus(
        WhatsappDeliveryStatus.SENT,
        WhatsappDeliveryStatus.FAILED
      )
    ).toBe(true);
    expect(
      shouldUpgradeWhatsappDeliveryStatus(
        WhatsappDeliveryStatus.PENDING,
        WhatsappDeliveryStatus.FAILED
      )
    ).toBe(true);
  });

  it("does not overwrite DELIVERED or READ with FAILED", () => {
    expect(
      shouldUpgradeWhatsappDeliveryStatus(
        WhatsappDeliveryStatus.DELIVERED,
        WhatsappDeliveryStatus.FAILED
      )
    ).toBe(false);
    expect(
      shouldUpgradeWhatsappDeliveryStatus(
        WhatsappDeliveryStatus.READ,
        WhatsappDeliveryStatus.FAILED
      )
    ).toBe(false);
  });
});
