import { describe, expect, it } from "vitest";
import {
  isQuoteRequestFaqAnswer,
  messageHasQuoteSpecifications,
  shouldBypassFaqMatch
} from "../src/utils/faq-bypass.js";

const TABLAS_FAQ_QUESTION = "¿Hacen tablas a medida?";
const TABLAS_FAQ_ANSWER =
  "Sí, las tablas personalizadas son nuestro producto estrella. Indícanos medidas, tipo de madera y uso (cocina, parrilla, servir) y te cotizamos.";

describe("messageHasQuoteSpecifications", () => {
  it("detects dimensions and wood type", () => {
    expect(messageHasQuoteSpecifications("hacen tablas de 80x80 con madera de roble rosado??")).toBe(
      true
    );
  });

  it("detects engraving questions", () => {
    expect(messageHasQuoteSpecifications("hacen grabados para tablas de madera?")).toBe(true);
  });

  it("ignores generic tablas questions", () => {
    expect(messageHasQuoteSpecifications("hacen tablas a medida?")).toBe(false);
  });
});

describe("shouldBypassFaqMatch", () => {
  it("bypasses tablas FAQ when user already provided specs", () => {
    expect(
      shouldBypassFaqMatch(
        "hacen tablas de 80x80 con madera de roble rosado??",
        TABLAS_FAQ_QUESTION,
        TABLAS_FAQ_ANSWER
      )
    ).toBe(true);
  });

  it("bypasses tablas FAQ for engraving sub-questions", () => {
    expect(
      shouldBypassFaqMatch(
        "hacen grabados para tablas de madera?",
        TABLAS_FAQ_QUESTION,
        TABLAS_FAQ_ANSWER
      )
    ).toBe(true);
  });

  it("keeps FAQ for generic tablas a medida question", () => {
    expect(
      shouldBypassFaqMatch("hacen tablas a medida?", TABLAS_FAQ_QUESTION, TABLAS_FAQ_ANSWER)
    ).toBe(false);
  });

  it("keeps non-quote FAQs", () => {
    expect(
      shouldBypassFaqMatch(
        "hacen despacho a providencia?",
        "¿Hacen despacho?",
        "Sí, despachamos en Región Metropolitana desde $4.500 CLP."
      )
    ).toBe(false);
  });
});

describe("isQuoteRequestFaqAnswer", () => {
  it("detects answers that ask for quote details", () => {
    expect(isQuoteRequestFaqAnswer(TABLAS_FAQ_ANSWER)).toBe(true);
  });
});
