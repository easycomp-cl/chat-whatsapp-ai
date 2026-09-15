import { describe, expect, it } from "vitest";
import {
  mergeInboundMediaIngestFailed,
  mergeInboundMediaIngestSucceeded,
  readInboundMediaIngestState
} from "../src/utils/inbound-media-ingest-state.js";
import {
  formatWhatsappDeliveryErrorMessage,
  parseGraphApiErrorBody,
  parseWhatsappDeliveryErrors
} from "../src/utils/whatsapp-delivery-error.js";

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

  it("formats delivery error message", () => {
    expect(
      formatWhatsappDeliveryErrorMessage({
        code: 131026,
        title: "Message undeliverable",
        message: "Recipient is not a valid WhatsApp user"
      })
    ).toBe(
      "Message undeliverable (131026): Recipient is not a valid WhatsApp user"
    );
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
