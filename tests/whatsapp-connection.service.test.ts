import { describe, expect, it } from "vitest";
import {
  hashAuthorizationCode,
  mapChannelToPublicStatus,
  normalizeDisplayPhone
} from "../src/modules/whatsapp-connection/whatsapp-connection.service.js";

describe("whatsapp connection helpers", () => {
  it("hashes authorization codes without keeping plaintext", () => {
    const hash = hashAuthorizationCode("AQBx-secret-code");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("AQBx");
    expect(hashAuthorizationCode("AQBx-secret-code")).toBe(hash);
    expect(hashAuthorizationCode("other-code")).not.toBe(hash);
  });

  it("normalizes Meta display phone numbers", () => {
    expect(normalizeDisplayPhone("56 9 4686 7544")).toBe("+56946867544");
    expect(normalizeDisplayPhone("+56946867544")).toBe("+56946867544");
  });

  it("maps channel rows to public connection status", () => {
    expect(mapChannelToPublicStatus(null)).toBe("pending");
    expect(
      mapChannelToPublicStatus({
        status: "ACTIVE",
        isActive: true,
        accessTokenEncrypted: "iv:tag:data",
        lastError: null
      })
    ).toBe("connected");
    expect(
      mapChannelToPublicStatus({
        status: "INACTIVE",
        isActive: false,
        accessTokenEncrypted: "iv:tag:data",
        lastError: "subscription_failed"
      })
    ).toBe("error");
  });
});
