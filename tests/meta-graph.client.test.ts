import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapOAuthGraphError,
  MetaGraphClient
} from "../src/modules/meta/meta-graph.client.js";

describe("mapOAuthGraphError", () => {
  it("maps expired authorization codes", () => {
    const error = mapOAuthGraphError(400, {
      error: { message: "This authorization code has expired", code: 100 }
    });
    expect(error.code).toBe("code_expired");
    expect(error.statusCode).toBe(400);
  });

  it("maps reused authorization codes", () => {
    const error = mapOAuthGraphError(400, {
      error: { message: "This authorization code has been used" }
    });
    expect(error.code).toBe("code_reused");
    expect(error.statusCode).toBe(409);
  });

  it("maps redirect_uri mismatches", () => {
    const error = mapOAuthGraphError(400, {
      error: { message: "Error validating verification code. Please make sure your redirect_uri is identical" }
    });
    expect(error.code).toBe("invalid_redirect_uri");
  });

  it("maps generic invalid codes", () => {
    const error = mapOAuthGraphError(400, {
      error: { message: "Invalid verification code", code: 100 }
    });
    expect(error.code).toBe("invalid_code");
  });
});

describe("MetaGraphClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchanges an Embedded Signup code without logging secrets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "EAA_test_token", token_type: "bearer", expires_in: 5184000 })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaGraphClient({
      graphVersion: "v21.0",
      appId: "1642810900259407",
      appSecret: "app-secret"
    });

    const token = await client.exchangeCodeForToken("AQBx-code");
    expect(token.accessToken).toBe("EAA_test_token");
    expect(token.expiresIn).toBe(5184000);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("oauth/access_token");
    expect(calledUrl).toContain("client_id=1642810900259407");
    expect(calledUrl).toContain("code=AQBx-code");
  });

  it("subscribes the WABA with the customer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaGraphClient({
      graphVersion: "v21.0",
      appId: "app",
      appSecret: "secret"
    });

    await client.subscribeWaba("waba-1", "EAA_customer");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/waba-1/subscribed_apps");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer EAA_customer"
    });
  });
});
