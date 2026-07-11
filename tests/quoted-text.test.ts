import { describe, expect, it } from "vitest";
import { truncateQuotedText, quotedUnavailableText } from "../src/utils/quoted-text.js";

describe("quoted-text", () => {
  it("truncates long quoted previews", () => {
    const long = "a".repeat(400);
    const result = truncateQuotedText(long, 300);
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns unavailable placeholder", () => {
    expect(quotedUnavailableText()).toBe("[Mensaje no disponible]");
  });
});
