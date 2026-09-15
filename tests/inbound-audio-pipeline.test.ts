import { describe, expect, it } from "vitest";
import { resolveStoredInboundPipelineText } from "../src/modules/conversations/inbound-audio.service.js";
import { isGreetingWithBusinessQuestion } from "../src/utils/conversational.js";

describe("inbound audio pipeline text", () => {
  it("prefers the transcript over the filename placeholder", () => {
    expect(
      resolveStoredInboundPipelineText({
        audioTranscript: "Hola, ¿tienen tablas de madera o repuestos?",
        contentText: "nota-voz.ogg"
      })
    ).toBe("Hola, ¿tienen tablas de madera o repuestos?");
  });

  it("falls back to content text when there is no transcript", () => {
    expect(
      resolveStoredInboundPipelineText({
        audioTranscript: null,
        contentText: "  [Audio]  "
      })
    ).toBe("[Audio]");
  });

  it("treats a transcribed greeting plus stock question as a business question", () => {
    expect(
      isGreetingWithBusinessQuestion("Hola, ¿tienen tablas de madera o repuestos?")
    ).toBe(true);
  });
});
