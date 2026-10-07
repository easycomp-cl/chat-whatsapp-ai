import { describe, expect, it } from "vitest";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type TokenExpirationStatus = "ok" | "expiring_soon" | "expired" | "permanent";

function getTokenExpirationStatus(tokenExpiresAt: Date | null | undefined): TokenExpirationStatus {
  if (!tokenExpiresAt) {
    return "permanent";
  }

  const now = Date.now();
  const expiresAt = tokenExpiresAt.getTime();
  const timeUntilExpiry = expiresAt - now;

  if (timeUntilExpiry <= 0) {
    return "expired";
  }

  if (timeUntilExpiry <= SEVEN_DAYS_MS) {
    return "expiring_soon";
  }

  return "ok";
}

describe("getTokenExpirationStatus", () => {
  it('returns "permanent" when tokenExpiresAt is null', () => {
    expect(getTokenExpirationStatus(null)).toBe("permanent");
  });

  it('returns "permanent" when tokenExpiresAt is undefined', () => {
    expect(getTokenExpirationStatus(undefined)).toBe("permanent");
  });

  it('returns "expired" when token expiration date is in the past', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(getTokenExpirationStatus(yesterday)).toBe("expired");
  });

  it('returns "expired" when token expires exactly now', () => {
    const now = new Date();
    expect(getTokenExpirationStatus(now)).toBe("expired");
  });

  it('returns "expiring_soon" when token expires in 1 day', () => {
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(getTokenExpirationStatus(oneDayFromNow)).toBe("expiring_soon");
  });

  it('returns "expiring_soon" when token expires in exactly 7 days', () => {
    const sevenDaysFromNow = new Date(Date.now() + SEVEN_DAYS_MS);
    expect(getTokenExpirationStatus(sevenDaysFromNow)).toBe("expiring_soon");
  });

  it('returns "ok" when token expires in 8 days', () => {
    const eightDaysFromNow = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(getTokenExpirationStatus(eightDaysFromNow)).toBe("ok");
  });

  it('returns "ok" when token expires in 60 days (typical user token)', () => {
    const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    expect(getTokenExpirationStatus(sixtyDaysFromNow)).toBe("ok");
  });
});
