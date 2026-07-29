import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildConversAiOutboundHeaders,
  buildConversAiSignedPayload,
  truncateResponseBody,
  verifyConversAiOutboundSignature
} from "../src/modules/flows/flow-webhook-outbound.utils.js";

describe("flow-webhook-outbound.utils", () => {
  it("builds signed outbound headers", () => {
    const body = JSON.stringify({ eventType: "quote.confirmed" });
    const secret = "super-secret";
    const timestamp = 1_700_000_000;
    const headers = buildConversAiOutboundHeaders({
      deliveryId: "del_123",
      eventType: "quote.confirmed",
      secret,
      body,
      timestamp
    });

    const signedPayload = buildConversAiSignedPayload(timestamp, body);
    const expected = `sha256=${createHmac("sha256", secret).update(signedPayload).digest("hex")}`;

    expect(headers["X-ConversAI-Event"]).toBe("quote.confirmed");
    expect(headers["X-ConversAI-Delivery-Id"]).toBe("del_123");
    expect(headers["X-ConversAI-Timestamp"]).toBe(String(timestamp));
    expect(headers["X-ConversAI-Signature"]).toBe(expected);
  });

  it("truncates long response bodies", () => {
    expect(truncateResponseBody("abc", 10)).toBe("abc");
    expect(truncateResponseBody("abcdefghijklmnop", 10)).toBe("abcdefghij…");
  });

  it("verifies outbound signature with timestamp", () => {
    const body = JSON.stringify({ ok: true });
    const secret = "secret-key";
    const timestamp = 1_700_000_000;
    const headers = buildConversAiOutboundHeaders({
      deliveryId: "del_1",
      eventType: "quote.confirmed",
      secret,
      body,
      timestamp
    });

    expect(
      verifyConversAiOutboundSignature({
        rawBody: body,
        signatureHeader: headers["X-ConversAI-Signature"],
        timestampHeader: headers["X-ConversAI-Timestamp"],
        secret,
        nowSeconds: timestamp
      })
    ).toBe(true);
  });
});
