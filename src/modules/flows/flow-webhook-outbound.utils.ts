import { createHmac, timingSafeEqual } from "node:crypto";

/** HTTP header prefix for outbound flow webhook deliveries (EasyComp Chat Bot Manager). */
export const CHAT_BOT_MANAGER_HEADER_PREFIX = "X-ChatBotManager";

export function buildChatBotManagerSignedPayload(timestamp: number, body: string): string {
  return `${timestamp}.${body}`;
}

export function buildChatBotManagerOutboundHeaders(input: {
  deliveryId: string;
  eventType: string;
  secret: string;
  body: string;
  timestamp?: number;
}): Record<string, string> {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = buildChatBotManagerSignedPayload(timestamp, input.body);

  return {
    "Content-Type": "application/json",
    [`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Event`]: input.eventType,
    [`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Delivery-Id`]: input.deliveryId,
    [`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Timestamp`]: String(timestamp),
    [`${CHAT_BOT_MANAGER_HEADER_PREFIX}-Signature`]: `sha256=${createHmac("sha256", input.secret)
      .update(signedPayload)
      .digest("hex")}`
  };
}

export function truncateResponseBody(body: string, maxLength = 2000): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}…`;
}

export function verifyChatBotManagerOutboundSignature(input: {
  rawBody: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  secret: string;
  maxAgeSeconds?: number;
  nowSeconds?: number;
}): boolean {
  if (!input.signatureHeader || !input.timestampHeader) {
    return false;
  }

  const timestamp = Number(input.timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const maxAge = input.maxAgeSeconds ?? 300;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > maxAge) {
    return false;
  }

  const signedPayload = buildChatBotManagerSignedPayload(timestamp, input.rawBody);
  const expected = `sha256=${createHmac("sha256", input.secret).update(signedPayload).digest("hex")}`;

  try {
    const sigBuf = Buffer.from(input.signatureHeader);
    const expBuf = Buffer.from(expected);
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}
