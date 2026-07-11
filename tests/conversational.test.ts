import { describe, expect, it } from "vitest";
import {
  buildConversationalReply,
  detectConversationalIntent,
  isGreetingWithBusinessQuestion
} from "../src/utils/conversational.js";

describe("detectConversationalIntent", () => {
  it("detects greetings", () => {
    expect(detectConversationalIntent("hola")).toBe("greeting");
    expect(detectConversationalIntent("HOLA")).toBe("greeting");
    expect(detectConversationalIntent("buenas")).toBe("greeting");
    expect(detectConversationalIntent("¿Cómo estás?")).toBe("greeting");
    expect(detectConversationalIntent("estas?")).toBe("greeting");
    expect(detectConversationalIntent("hola están atendiendo??")).toBe("greeting");
  });

  it("detects thanks and acknowledgements", () => {
    expect(detectConversationalIntent("gracias")).toBe("thanks");
    expect(detectConversationalIntent("ok")).toBe("ack");
    expect(detectConversationalIntent("vale")).toBe("ack");
  });

  it("ignores business questions", () => {
    expect(detectConversationalIntent("¿Cuál es el horario?")).toBeNull();
    expect(detectConversationalIntent("precio del pan amasado")).toBeNull();
  });

  it("detects hybrid greeting with business question", () => {
    expect(detectConversationalIntent("Hola, cuanto vale la tabla")).toBeNull();
    expect(isGreetingWithBusinessQuestion("Hola, cuanto vale la tabla")).toBe(true);
  });
});

describe("buildConversationalReply", () => {
  it("uses configured greeting message", () => {
    const reply = buildConversationalReply("greeting", {
      greetingMessage: "Hola, soy Sol de Panadería Sol.",
      botName: "Sol"
    });
    expect(reply).toContain("Hola, soy Sol de Panadería Sol.");
    expect(reply).toContain("¿En qué te puedo ayudar hoy?");
  });

  it("uses tone greeting when provided", () => {
    const reply = buildConversationalReply("greeting", {
      greetingMessage: "Hola, soy Sol de Panadería Sol.",
      botName: "Sol",
      toneGreeting: "Holaaa"
    });
    expect(reply).toContain("Holaaa");
    expect(reply).not.toContain("Panadería Sol");
  });
});
