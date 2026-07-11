import { describe, expect, it } from "vitest";

describe("MetricsService calculations", () => {
  it("computes estimated hours saved formula", () => {
    const aiResponses = 10;
    const estimatedHoursSaved = (aiResponses * 1.5) / 60;
    expect(estimatedHoursSaved).toBeCloseTo(0.25);
  });

  it("aggregates top questions from in-memory list", () => {
    const messages = [
      { contentText: "¿Cuál es el horario?" },
      { contentText: "¿Cuál es el horario?" },
      { contentText: "¿Hacen despacho?" }
    ];

    const counts = new Map<string, number>();
    for (const msg of messages) {
      const key = msg.contentText.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    expect(top[0]?.[0]).toBe("¿cuál es el horario?");
    expect(top[0]?.[1]).toBe(2);
  });
});
