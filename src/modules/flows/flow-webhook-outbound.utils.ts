import { createHmac, timingSafeEqual } from "node:crypto";

export function buildConversAiSignedPayload(timestamp: number, body: string): string {
  return `${timestamp}.${body}`;
}

export function buildConversAiOutboundHeaders(input: {
  deliveryId: string;
  eventType: string;
  secret: string;
  body: string;
  timestamp?: number;
}): Record<string, string> {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = buildConversAiSignedPayload(timestamp, input.body);

  return {
    "Content-Type": "application/json",
    "X-ConversAI-Event": input.eventType,
    "X-ConversAI-Delivery-Id": input.deliveryId,
    "X-ConversAI-Timestamp": String(timestamp),
    "X-ConversAI-Signature": `sha256=${createHmac("sha256", input.secret)
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

export function verifyConversAiOutboundSignature(input: {
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

  const signedPayload = buildConversAiSignedPayload(timestamp, input.rawBody);
  const expected = `sha256=${createHmac("sha256", input.secret).update(signedPayload).digest("hex")}`;

  try {
    const sigBuf = Buffer.from(input.signatureHeader);
    const expBuf = Buffer.from(expected);
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}
