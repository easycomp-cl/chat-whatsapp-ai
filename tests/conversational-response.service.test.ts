import { describe, expect, it } from "vitest";
import {
  applyConversationalPlaceholders,
  parseConversationalConfig,
  pickConversationalResponse
} from "../src/modules/runtime/conversational-response.service.js";

describe("conversational-response.service", () => {
  it("parses conversationalResponses from configJson", () => {
    const config = parseConversationalConfig({
      conversationalResponses: [
        {
          trigger: "thanks",
          enabled: true,
          selection: "random",
          variants: [{ text: "¡De nada {nombre}!" }]
        }
      ],
      handoff_on_low_confidence: true
    });

    expect(config.responses).toHaveLength(1);
    expect(config.responses[0]?.trigger).toBe("thanks");
    expect(config.handoff_on_low_confidence).toBe(true);
  });

  it("applies placeholders", () => {
    const text = applyConversationalPlaceholders("Hola {nombre}, soy {bot} de {negocio}.", {
      nombre: "Camila",
      bot: "Sol",
      negocio: "Panadería",
      saludo: "Holaaa"
    });
    expect(text).toBe("Hola Camila, soy Sol de Panadería.");
  });

  it("picks variant by round robin deterministically", () => {
    const config = parseConversationalConfig({
      conversationalResponses: [
        {
          trigger: "ack",
          enabled: true,
          selection: "round_robin",
          variants: [{ text: "Opción A" }, { text: "Opción B" }]
        }
      ]
    });

    const first = pickConversationalResponse({
      trigger: "ack",
      config,
      warmth: "neutral",
      conversationId: "conv-abc",
      placeholders: { negocio: "X", bot: "Y", saludo: "Hola" }
    });
    const second = pickConversationalResponse({
      trigger: "ack",
      config,
      warmth: "neutral",
      conversationId: "conv-abc",
      placeholders: { negocio: "X", bot: "Y", saludo: "Hola" }
    });

    expect(first).toBe(second);
    expect(["Opción A", "Opción B"]).toContain(first);
  });

  it("returns soft fallback when no custom variant exists", () => {
    const reply = pickConversationalResponse({
      trigger: "soft_fallback",
      config: parseConversationalConfig({}),
      warmth: "neutral",
      conversationId: "conv-1",
      placeholders: { negocio: "Panadería", bot: "Sol", saludo: "Hola" },
      fallbackMessage: "Déjame confirmarlo y te aviso."
    });
    expect(reply).toBe("Déjame confirmarlo y te aviso.");
  });
});
