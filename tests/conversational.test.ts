import { describe, expect, it } from "vitest";
import {
  buildConversationalReply,
  detectConversationalIntent,
  isGreetingWithBusinessQuestion
} from "../src/utils/conversational.js";

describe("detectConversationalIntent", () => {
  it("detects greetings including elongated variants", () => {
    expect(detectConversationalIntent("hola")).toBe("greeting");
    expect(detectConversationalIntent("HOLA")).toBe("greeting");
    expect(detectConversationalIntent("buenas")).toBe("greeting");
    expect(detectConversationalIntent("holiii")).toBe("greeting");
    expect(detectConversationalIntent("buenasss")).toBe("greeting");
    expect(detectConversationalIntent("¿Cómo estás?")).toBe("greeting");
    expect(detectConversationalIntent("estas?")).toBe("greeting");
    expect(detectConversationalIntent("buen dia como estas")).toBe("greeting");
  });

  it("detects thanks and acknowledgements", () => {
    expect(detectConversationalIntent("gracias")).toBe("thanks");
    expect(detectConversationalIntent("ok")).toBe("ack");
    expect(detectConversationalIntent("vale")).toBe("ack");
  });

  it("ignores business questions without greeting prefix", () => {
    expect(detectConversationalIntent("¿Cuál es el horario?")).toBeNull();
    expect(detectConversationalIntent("precio del pan amasado")).toBeNull();
  });

  it("detects hybrid greeting with business question", () => {
    expect(detectConversationalIntent("Hola, cuanto vale la tabla")).toBeNull();
    expect(detectConversationalIntent("hola estan atendiendo")).toBeNull();
    expect(detectConversationalIntent("hola están atendiendo??")).toBeNull();
    expect(isGreetingWithBusinessQuestion("Hola, cuanto vale la tabla")).toBe(true);
    expect(isGreetingWithBusinessQuestion("hola estan atendiendo")).toBe(true);
  });
});

describe("buildConversationalReply", () => {
  const baseConfig = {
    greetingMessage: "Hola, soy Sol de Panadería Sol.",
    botName: "Sol",
    businessName: "Panadería Sol",
    conversationId: "conv-1"
  };

  it("uses configured greeting message", () => {
    const reply = buildConversationalReply("greeting", baseConfig);
    expect(reply).toContain("Hola, soy Sol de Panadería Sol.");
    expect(reply).toContain("¿En qué te puedo ayudar hoy?");
  });

  it("uses tone greeting when provided", () => {
    const reply = buildConversationalReply("greeting", {
      ...baseConfig,
      toneGreeting: "Holaaa"
    });
    expect(reply).toContain("Holaaa");
    expect(reply).not.toContain("Panadería Sol");
  });

  it("uses custom variants from conversationalResponses", () => {
    const reply = buildConversationalReply("greeting", {
      ...baseConfig,
      toneGreeting: "Holaaa",
      conversationalConfig: {
        handoff_on_low_confidence: false,
        responses: [
          {
            trigger: "greeting_pure",
            enabled: true,
            selection: "random",
            variants: [{ text: "{saludo} ¿Qué necesitas {nombre}?" }]
          }
        ]
      },
      customerName: "Camila"
    });
    expect(reply).toBe("Holaaa ¿Qué necesitas Camila?");
  });

  it("uses returning customer trigger when configured", () => {
    const reply = buildConversationalReply("greeting", {
      ...baseConfig,
      toneGreeting: "Holaaa",
      isReturningCustomer: true,
      customerName: "Camila",
      conversationalConfig: {
        handoff_on_low_confidence: false,
        responses: [
          {
            trigger: "greeting_returning",
            enabled: true,
            selection: "random",
            variants: [{ text: "Qué bueno verte de nuevo {nombre}!" }]
          }
        ]
      }
    });
    expect(reply).toBe("Qué bueno verte de nuevo Camila!");
  });
});
