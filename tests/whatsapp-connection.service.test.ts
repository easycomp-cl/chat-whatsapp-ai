import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashAuthorizationCode,
  mapChannelToPublicStatus,
  normalizeDisplayPhone
} from "../src/modules/whatsapp-connection/whatsapp-connection.utils.js";
import { WhatsAppConnectionService } from "../src/modules/whatsapp-connection/whatsapp-connection.service.js";
import { MetaGraphClient } from "../src/modules/meta/meta-graph.client.js";
import { prisma } from "../src/lib/prisma.js";

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

describe("WhatsAppConnectionService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls registerPhoneNumber after subscribeWaba during Embedded Signup", async () => {
    const mockGraphClient = {
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        accessToken: "EAA_short_token",
        expiresIn: 3600
      }),
      exchangeForLongLivedToken: vi.fn().mockResolvedValue({
        accessToken: "EAA_long_token",
        expiresIn: 5184000
      }),
      subscribeWaba: vi.fn().mockResolvedValue(undefined),
      registerPhoneNumber: vi.fn().mockResolvedValue(undefined),
      getPhoneNumber: vi.fn().mockResolvedValue({
        id: "123456",
        displayPhoneNumber: "+56946867544"
      }),
      getWaba: vi.fn().mockResolvedValue({
        id: "waba-123",
        businessId: "biz-456"
      })
    } as unknown as MetaGraphClient;

    const mockFactory = vi.fn().mockReturnValue(mockGraphClient);

    vi.spyOn(prisma.tenant, "findUnique").mockResolvedValue({ id: "tenant-1" } as any);
    vi.spyOn(prisma.whatsAppConnectionSession, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.tenantChannel, "findUnique")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.spyOn(prisma.whatsAppConnectionSession, "create").mockResolvedValue({
      id: "session-1",
      tenantId: "tenant-1",
      status: "PENDING"
    } as any);
    vi.spyOn(prisma.whatsAppConnectionSession, "update").mockResolvedValue({} as any);
    vi.spyOn(prisma.tenantChannel, "create").mockResolvedValue({
      id: "channel-1",
      tenantId: "tenant-1",
      phoneNumberId: "123456"
    } as any);
    vi.spyOn(prisma.tenantChannel, "updateMany").mockResolvedValue({ count: 0 } as any);

    const service = new WhatsAppConnectionService(mockFactory);

    await service.completeEmbeddedSignup("tenant-1", {
      code: "AQBx-test-code",
      waba_id: "waba-123",
      phone_number_id: "123456",
      pin: "123456"
    });

    expect(mockGraphClient.subscribeWaba).toHaveBeenCalledWith("waba-123", "EAA_long_token");
    expect(mockGraphClient.registerPhoneNumber).toHaveBeenCalledWith("123456", "EAA_long_token", "123456");
    expect(mockGraphClient.registerPhoneNumber).toHaveBeenCalledAfter(mockGraphClient.subscribeWaba as any);
  });

  it("fails signup and does not mark as connected when registerPhoneNumber fails", async () => {
    const mockGraphClient = {
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        accessToken: "EAA_short_token",
        expiresIn: 3600
      }),
      exchangeForLongLivedToken: vi.fn().mockResolvedValue({
        accessToken: "EAA_long_token",
        expiresIn: 5184000
      }),
      subscribeWaba: vi.fn().mockResolvedValue(undefined),
      registerPhoneNumber: vi.fn().mockRejectedValue({
        code: "register_failed",
        message: "Invalid PIN",
        statusCode: 400
      }),
      getPhoneNumber: vi.fn().mockResolvedValue({
        id: "123456",
        displayPhoneNumber: "+56946867544"
      }),
      getWaba: vi.fn().mockResolvedValue({
        id: "waba-123",
        businessId: "biz-456"
      })
    } as unknown as MetaGraphClient;

    const mockFactory = vi.fn().mockReturnValue(mockGraphClient);

    vi.spyOn(prisma.tenant, "findUnique").mockResolvedValue({ id: "tenant-1" } as any);
    vi.spyOn(prisma.whatsAppConnectionSession, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.tenantChannel, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.whatsAppConnectionSession, "create").mockResolvedValue({
      id: "session-1",
      tenantId: "tenant-1",
      status: "PENDING"
    } as any);
    const updateSessionSpy = vi.spyOn(prisma.whatsAppConnectionSession, "update").mockResolvedValue({} as any);
    const updateChannelSpy = vi.spyOn(prisma.tenantChannel, "updateMany").mockResolvedValue({} as any);

    const service = new WhatsAppConnectionService(mockFactory);

    await expect(
      service.completeEmbeddedSignup("tenant-1", {
        code: "AQBx-test-code",
        waba_id: "waba-123",
        phone_number_id: "123456",
        pin: "wrong-pin"
      })
    ).rejects.toMatchObject({
      code: "register_failed"
    });

    const updateCalls = updateSessionSpy.mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    const failedUpdateCall = updateCalls.find((call) => call[0].where?.id === "session-1");
    expect(failedUpdateCall).toBeDefined();
    expect(failedUpdateCall?.[0].data).toMatchObject({
      status: "FAILED"
    });
  });
});
