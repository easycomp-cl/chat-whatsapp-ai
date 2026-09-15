import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildChatBotManagerOutboundHeaders,
  buildChatBotManagerSignedPayload,
  CHAT_BOT_MANAGER_HEADER_PREFIX,
  truncateResponseBody,
  verifyChatBotManagerOutboundSignature
} from "../src/modules/flows/flow-webhook-outbound.utils.js";

describe("flow-webhook-outbound.utils", () => {
  it("builds signed outbound headers", () => {
    const body = JSON.stringify({ eventType: "quote.confirmed" });
    const secret = "super-secret";
    const timestamp = 1_700_000_000;
    const headers = buildChatBotManagerOutboundHeaders({
      deliveryId: "del_123",
      eventType: "quote.confirmed",
      secret,
      body,
      timestamp
    });

    const signedPayload = buildChatBotManagerSignedPayload(timestamp, body);
    const expected = `sha256=${createHmac("sha256", secret).update(signedPayload).digest("hex")}`;

    expect(headers[`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Event`]).toBe("quote.confirmed");
    expect(headers[`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Delivery-Id`]).toBe("del_123");
    expect(headers[`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Timestamp`]).toBe(String(timestamp));
    expect(headers[`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Signature`]).toBe(expected);
  });

  it("truncates long response bodies", () => {
    expect(truncateResponseBody("abc", 10)).toBe("abc");
    expect(truncateResponseBody("abcdefghijklmnop", 10)).toBe("abcdefghij…");
  });

  it("verifies outbound signature with timestamp", () => {
    const body = JSON.stringify({ ok: true });
    const secret = "secret-key";
    const timestamp = 1_700_000_000;
    const headers = buildChatBotManagerOutboundHeaders({
      deliveryId: "del_1",
      eventType: "quote.confirmed",
      secret,
      body,
      timestamp
    });

    expect(
      verifyChatBotManagerOutboundSignature({
        rawBody: body,
        signatureHeader: headers[`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Signature`],
        timestampHeader: headers[`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Timestamp`],
        secret,
        nowSeconds: timestamp
      })
    ).toBe(true);
  });
});
