import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptionService } from "../src/lib/encryption.service.js";
import {
  attachEncryptedWebhookSecret,
  buildFlowStartIdempotencyKey,
  getWebhookSecretFromTrigger,
  verifyConversAiSignature
} from "../src/modules/flows/flow-webhook.utils.js";

describe("flow-webhook.utils", () => {
  it("roundtrips encrypted webhook secret in trigger config", () => {
    const plain = "abc123secret";
    const config = attachEncryptedWebhookSecret({ intent: "quote" }, plain);
    expect(getWebhookSecretFromTrigger(config)).toBe(plain);
    expect(getWebhookSecretFromTrigger({})).toBeNull();
  });

  it("verifies ConversAI HMAC signature", () => {
    const secret = "test-secret";
    const body = Buffer.from(JSON.stringify({ customer_phone: "+56912345678" }));
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    expect(verifyConversAiSignature(body, signature, secret)).toBe(true);
    expect(verifyConversAiSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyConversAiSignature(body, undefined, secret)).toBe(false);
  });

  it("builds stable idempotency keys", () => {
    expect(buildFlowStartIdempotencyKey("tenant-1", "api", "req-9")).toBe(
      "tenant-1:flow-start:api:req-9"
    );
  });

  it("ignores invalid encrypted secret payloads", () => {
    const broken = { _webhookSecretEncrypted: encryptionService.encrypt("ok").slice(0, -4) };
    expect(getWebhookSecretFromTrigger(broken)).toBeNull();
  });
});
