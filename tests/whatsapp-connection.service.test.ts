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

  it("getConnection includes token_status field", async () => {
    const mockChannel = {
      id: "channel-1",
      tenantId: "tenant-1",
      phoneNumberId: "123456",
      phoneNumber: "+56946867544",
      wabaId: "waba-123",
      metaBusinessId: "biz-456",
      accessTokenEncrypted: "encrypted-token",
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      status: "ACTIVE" as const,
      isActive: true,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(prisma.tenant, "findUnique").mockResolvedValue({ id: "tenant-1" } as any);
    vi.spyOn(prisma.tenantChannel, "findUnique").mockResolvedValue(mockChannel as any);

    const service = new WhatsAppConnectionService();
    const connection = await service.getConnection("tenant-1");

    expect(connection).toBeDefined();
    expect(connection?.token_status).toBe("ok");
    expect(connection?.token_expires_at).toBeDefined();
  });

  it("getConnection returns permanent token_status for null tokenExpiresAt", async () => {
    const mockChannel = {
      id: "channel-1",
      tenantId: "tenant-1",
      phoneNumberId: "123456",
      phoneNumber: "+56946867544",
      wabaId: "waba-123",
      metaBusinessId: "biz-456",
      accessTokenEncrypted: "encrypted-token",
      tokenExpiresAt: null,
      status: "ACTIVE" as const,
      isActive: true,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(prisma.tenant, "findUnique").mockResolvedValue({ id: "tenant-1" } as any);
    vi.spyOn(prisma.tenantChannel, "findUnique").mockResolvedValue(mockChannel as any);

    const service = new WhatsAppConnectionService();
    const connection = await service.getConnection("tenant-1");

    expect(connection).toBeDefined();
    expect(connection?.token_status).toBe("permanent");
    expect(connection?.token_expires_at).toBeNull();
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
      debugToken: vi.fn().mockResolvedValue({
        data: {
          app_id: "1642810900259407",
          expires_at: Math.floor(Date.now() / 1000) + 5184000,
          is_valid: true
        }
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
      debugToken: vi.fn().mockResolvedValue({
        data: {
          app_id: "1642810900259407",
          expires_at: Math.floor(Date.now() / 1000) + 5184000,
          is_valid: true
        }
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

  it("preserves permanent tokens (no expires_in) by skipping fb_exchange_token", async () => {
    const mockGraphClient = {
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        accessToken: "EAA_permanent_system_user_token"
      }),
      exchangeForLongLivedToken: vi.fn(),
      subscribeWaba: vi.fn().mockResolvedValue(undefined),
      registerPhoneNumber: vi.fn().mockResolvedValue(undefined),
      getPhoneNumber: vi.fn().mockResolvedValue({
        id: "123456",
        displayPhoneNumber: "+56946867544"
      }),
      debugToken: vi.fn().mockResolvedValue({
        data: {
          app_id: "1642810900259407",
          expires_at: 0,
          is_valid: true
        }
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
    const createChannelSpy = vi.spyOn(prisma.tenantChannel, "create").mockResolvedValue({
      id: "channel-1",
      tenantId: "tenant-1",
      phoneNumberId: "123456",
      tokenExpiresAt: null
    } as any);

    const service = new WhatsAppConnectionService(mockFactory);

    await service.completeEmbeddedSignup("tenant-1", {
      code: "AQBx-permanent-code",
      waba_id: "waba-123",
      phone_number_id: "123456",
      pin: "123456"
    });

    expect(mockGraphClient.exchangeForLongLivedToken).not.toHaveBeenCalled();
    expect(mockGraphClient.debugToken).toHaveBeenCalledWith("EAA_permanent_system_user_token");
    
    const createCall = createChannelSpy.mock.calls[0];
    expect(createCall?.[0].data).toMatchObject({
      accessTokenEncrypted: expect.any(String),
      tokenExpiresAt: null
    });
  });

  it("calls exchangeForLongLivedToken when token has expires_in", async () => {
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
      debugToken: vi.fn().mockResolvedValue({
        data: {
          app_id: "1642810900259407",
          expires_at: Math.floor(Date.now() / 1000) + 5184000,
          is_valid: true
        }
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

    const service = new WhatsAppConnectionService(mockFactory);

    await service.completeEmbeddedSignup("tenant-1", {
      code: "AQBx-user-code",
      waba_id: "waba-123",
      phone_number_id: "123456",
      pin: "123456"
    });

    expect(mockGraphClient.exchangeForLongLivedToken).toHaveBeenCalledWith("EAA_short_token");
    expect(mockGraphClient.debugToken).toHaveBeenCalledWith("EAA_long_token");
  });

  it("falls back to expires_in when debug_token fails", async () => {
    const mockGraphClient = {
      exchangeCodeForToken: vi.fn().mockResolvedValue({
        accessToken: "EAA_token",
        expiresIn: 5184000
      }),
      exchangeForLongLivedToken: vi.fn().mockResolvedValue(null),
      subscribeWaba: vi.fn().mockResolvedValue(undefined),
      registerPhoneNumber: vi.fn().mockResolvedValue(undefined),
      getPhoneNumber: vi.fn().mockResolvedValue({
        id: "123456",
        displayPhoneNumber: "+56946867544"
      }),
      debugToken: vi.fn().mockResolvedValue(null)
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
    const createChannelSpy = vi.spyOn(prisma.tenantChannel, "create").mockResolvedValue({
      id: "channel-1",
      tenantId: "tenant-1",
      phoneNumberId: "123456"
    } as any);

    const service = new WhatsAppConnectionService(mockFactory);

    await service.completeEmbeddedSignup("tenant-1", {
      code: "AQBx-fallback-code",
      waba_id: "waba-123",
      phone_number_id: "123456",
      pin: "123456"
    });

    expect(mockGraphClient.debugToken).toHaveBeenCalled();
    
    const createCall = createChannelSpy.mock.calls[0];
    expect(createCall?.[0].data.tokenExpiresAt).toBeInstanceOf(Date);
  });
});
