import { createHmac, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import { encryptionService } from "../../lib/encryption.service.js";

const WEBHOOK_SECRET_CONFIG_KEY = "_webhookSecretEncrypted";

export function hashWebhookSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function attachEncryptedWebhookSecret(
  configurationJson: Record<string, unknown>,
  plainSecret: string
): Record<string, unknown> {
  return {
    ...configurationJson,
    [WEBHOOK_SECRET_CONFIG_KEY]: encryptionService.encrypt(plainSecret)
  };
}

export function getWebhookSecretFromTrigger(configurationJson: unknown): string | null {
  if (!configurationJson || typeof configurationJson !== "object") {
    return null;
  }

  const encrypted = (configurationJson as Record<string, unknown>)[WEBHOOK_SECRET_CONFIG_KEY];
  if (typeof encrypted !== "string" || !encrypted) {
    return null;
  }

  try {
    return encryptionService.decrypt(encrypted);
  } catch {
    return null;
  }
}

export function verifyConversAiSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  try {
    const sigBuf = Buffer.from(signatureHeader);
    const expBuf = Buffer.from(expected);
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function buildFlowStartIdempotencyKey(tenantId: string, source: string, key: string): string {
  return `${tenantId}:flow-start:${source}:${key}`;
}
