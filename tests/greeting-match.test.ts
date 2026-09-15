import { describe, expect, it } from "vitest";
import {
  hasBusinessQuestionSignal,
  hasGreetingPrefix,
  isGreetingLike,
  isGreetingWithBusinessQuestion,
  isPureGreeting
} from "../src/utils/greeting-match.js";

describe("greeting-match", () => {
  it("detects elongated greetings", () => {
    expect(isPureGreeting("holiii")).toBe(true);
    expect(isPureGreeting("buenasss")).toBe(true);
    expect(isPureGreeting("holaaa")).toBe(true);
    expect(hasGreetingPrefix("holiii")).toBe(true);
    expect(hasGreetingPrefix("buenasss")).toBe(true);
  });

  it("detects classic greetings", () => {
    expect(isPureGreeting("hola")).toBe(true);
    expect(isPureGreeting("buenas")).toBe(true);
    expect(isPureGreeting("buen dia")).toBe(true);
    expect(isPureGreeting("como estas")).toBe(true);
    expect(isPureGreeting("buen dia como estas")).toBe(true);
  });

  it("detects hybrid greeting with business question", () => {
    expect(isGreetingWithBusinessQuestion("Hola, cuanto vale la tabla")).toBe(true);
    expect(isGreetingWithBusinessQuestion("Hola tia tienen abierto?")).toBe(true);
    expect(isGreetingWithBusinessQuestion("hola estan atendiendo")).toBe(true);
    expect(isGreetingWithBusinessQuestion("hola están atendiendo??")).toBe(true);
    expect(isPureGreeting("hola estan atendiendo")).toBe(false);
  });

  it("does not treat social follow-ups as business questions", () => {
    expect(isPureGreeting("hola como estas")).toBe(true);
    expect(hasBusinessQuestionSignal("hola como estas")).toBe(false);
    expect(isGreetingWithBusinessQuestion("hola como estas")).toBe(false);
  });

  it("marks greeting-like messages for safe routing", () => {
    expect(isGreetingLike("holiii")).toBe(true);
    expect(isGreetingLike("precio del pan")).toBe(false);
  });
});
