import { describe, expect, it } from "vitest";
import { chunkText } from "../src/utils/chunk-text.js";
import {
  extractContentWords,
  keywordCoverage,
  scoreChunkForQuery,
  scoreFaqDirectMatch
} from "../src/utils/direct-match.js";

describe("direct-match", () => {
  it("extracts product keywords from direct price questions", () => {
    expect(extractContentWords("¿Cuánto cuesta la hallulla?")).toEqual(["hallulla"]);
  });

  it("boosts RAG score when all query keywords appear in chunk", () => {
    const chunk =
      "Hallulla x6: Pan fresco del día, precio $1.800 CLP. Torta Tres Leches: Porción individual, precio $3.500 CLP.";
    const boosted = scoreChunkForQuery("¿Cuánto cuesta la hallulla?", chunk, 0.46);
    expect(boosted).toBeGreaterThanOrEqual(0.82);
  });

  it("does not boost unrelated chunks", () => {
    const chunk = "Lunes a sábado de 07:30 a 20:00.";
    const score = scoreChunkForQuery("¿Cuánto cuesta la hallulla?", chunk, 0.12);
    expect(score).toBe(0.12);
  });

  it("matches FAQ direct variants with shared keywords", () => {
    const score = scoreFaqDirectMatch("¿Hacen despacho a domicilio?", "¿Hacen despacho?");
    expect(score).toBeGreaterThanOrEqual(0.65);
  });

  it("matches horario variants", () => {
    const score = scoreFaqDirectMatch("Me puedes decir el horario?", "¿Cuál es el horario?");
    expect(score).toBeGreaterThanOrEqual(0.65);
  });

  it("matches informal product price questions", () => {
    const score = scoreFaqDirectMatch(
      "a cuanto las hallullas",
      "¿Cuánto cuestan las hallullas artesanales?",
      ["precio hallulla", "cuanto sale la hallulla"]
    );
    expect(score).toBeGreaterThanOrEqual(0.5);
  });
});

describe("chunk-text", () => {
  it("splits catalog entries by sentence", () => {
    const chunks = chunkText(
      "Hallulla x6: Pan fresco del día, precio $1.800 CLP. Torta Tres Leches: Porción individual, precio $3.500 CLP."
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("Hallulla");
    expect(chunks[1]).toContain("Torta Tres Leches");
  });
});

describe("keywordCoverage", () => {
  it("measures overlap from source to target", () => {
    expect(keywordCoverage("¿Hacen despacho?", "hacen despacho en providencia")).toBe(1);
  });
});
