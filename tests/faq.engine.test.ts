import { describe, expect, it } from "vitest";
import { detectHandoffReason } from "../src/modules/runtime/prompts.js";

describe("FAQ / intent detection", () => {
  it("detects exact FAQ match via normalization logic", () => {
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9\s]/gi, "")
        .trim();

    expect(normalize("¿Cuál es el horario?")).toBe(normalize("cual es el horario"));
  });

  it("detects human handoff intent", () => {
    expect(detectHandoffReason("Quiero hablar con un asesor")).toBe("user_requested_human");
  });

  it("detects complaint intent", () => {
    expect(detectHandoffReason("Tengo un reclamo grave")).toBe("complaint");
  });

  it("detects warranty intent", () => {
    expect(detectHandoffReason("Necesito hacer una devolución")).toBe("warranty_return");
  });
});
