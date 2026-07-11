import { describe, expect, it } from "vitest";
import { greetingExtractorService } from "../src/modules/chat-analysis/services/greeting-extractor.service.js";
import type { ParsedChatMessage } from "../src/modules/chat-analysis/types/parsed-chat-message.type.js";

describe("greetingExtractorService", () => {
  const messages: ParsedChatMessage[] = [
    { date: "1/1/26", time: "10:00", sender: "Cliente", message: "Hola" },
    { date: "1/1/26", time: "10:01", sender: "The Wood Club", message: "Holaaa" },
    { date: "2/1/26", time: "09:00", sender: "Otro", message: "Buen dia" },
    { date: "2/1/26", time: "09:01", sender: "The Wood Club", message: "Hola! Buen dia!" },
    { date: "3/1/26", time: "11:00", sender: "Cliente 2", message: "Hola" },
    { date: "3/1/26", time: "11:01", sender: "The Wood Club", message: "Hola" },
    { date: "3/1/26", time: "11:05", sender: "The Wood Club", message: "Las tablas valen 50 mil" }
  ];

  it("extracts business greetings with source label", () => {
    const greetings = greetingExtractorService.extractFromChat({
      messages,
      businessSenderName: "The Wood Club",
      sourceLabel: "The Wood Club"
    });

    expect(greetings.length).toBeGreaterThanOrEqual(2);
    expect(greetings.some((g) => g.text === "Holaaa")).toBe(true);
    expect(greetings.some((g) => g.text === "Hola! Buen dia!")).toBe(true);
    expect(greetings.every((g) => g.source === "The Wood Club")).toBe(true);
  });

  it("detects repeated filler words", () => {
    const fillers = greetingExtractorService.extractFillerWords([
      "Dale po, te mando el precio",
      "Ya po, quedo atento",
      "Dale, nos vemos"
    ]);
    expect(fillers).toContain("po");
    expect(fillers).toContain("dale");
  });
});
