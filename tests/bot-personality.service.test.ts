import { describe, expect, it } from "vitest";
import {
  buildBotPersonalitySnapshot,
  mergeBotPersonalityConfigJson
} from "../src/modules/tenants/bot-personality.service.js";

describe("bot-personality.service", () => {
  it("builds snapshot with defaults and trigger metadata", () => {
    const snapshot = buildBotPersonalitySnapshot({
      botName: "Sol",
      botTone: "cercano",
      greetingMessage: "Hola, soy Sol.",
      fallbackMessage: "No tengo ese dato.",
      handoffMessage: "Te derivo con un asesor.",
      outOfHoursMessage: "Fuera de horario.",
      configJson: {}
    });

    expect(snapshot.bot_name).toBe("Sol");
    expect(snapshot.greeting_config.returning_min_messages).toBe(3);
    expect(snapshot.handoff_on_low_confidence).toBe(false);
    expect(snapshot.triggers.length).toBe(5);
    expect(snapshot.placeholders).toContain("{nombre}");
  });

  it("merges conversational responses into configJson", () => {
    const merged = mergeBotPersonalityConfigJson(
      { toneRules: { foo: "bar" } },
      {
        conversational_responses: [
          {
            trigger: "thanks",
            enabled: true,
            selection: "random",
            variants: [{ text: "¡De nada!" }]
          }
        ],
        handoff_on_low_confidence: true,
        greeting_config: { returning_min_messages: 5 }
      }
    ) as Record<string, unknown>;

    expect(merged.toneRules).toEqual({ foo: "bar" });
    expect(merged.handoff_on_low_confidence).toBe(true);
    expect(Array.isArray(merged.conversationalResponses)).toBe(true);
    expect((merged.toneGreetingConfig as { returning_min_messages: number }).returning_min_messages).toBe(
      5
    );
  });
});
