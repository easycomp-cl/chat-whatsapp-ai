import { describe, expect, it } from "vitest";
import {
  formatRutDisplay,
  isValidChileanRut,
  normalizeRutStorage,
  validateOptionalRut
} from "../src/utils/chilean-rut.js";

describe("chilean-rut", () => {
  it("validates known RUT", () => {
    expect(isValidChileanRut("12.345.678-5")).toBe(true);
    expect(isValidChileanRut("11.111.111-1")).toBe(true);
  });

  it("rejects invalid check digit", () => {
    expect(isValidChileanRut("12.345.678-9")).toBe(false);
  });

  it("normalizes storage format", () => {
    expect(normalizeRutStorage("12.345.678-5")).toBe("12345678-5");
  });

  it("formats display", () => {
    expect(formatRutDisplay("12345678-5")).toBe("12.345.678-5");
  });

  it("allows empty optional RUT", () => {
    expect(validateOptionalRut("")).toBeNull();
    expect(validateOptionalRut(null)).toBeNull();
  });

  it("throws on invalid optional RUT", () => {
    expect(() => validateOptionalRut("12.345.678-9")).toThrow("RUT inválido");
  });
});
