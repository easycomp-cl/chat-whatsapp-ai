import { describe, expect, it } from "vitest";
import { escalationDetectorService } from "../src/modules/runtime/escalation-detector.service.js";

describe("EscalationDetectorService", () => {
  it("hands off on explicit human request", () => {
    const result = escalationDetectorService.evaluatePreResponse({
      incomingText: "quiero hablar con un asesor",
      recentBotMessages: []
    });
    expect(result).toEqual({ action: "handoff", reason: "user_requested_human" });
  });

  it("hands off on frustration after soft fallback", () => {
    const result = escalationDetectorService.evaluatePreResponse({
      incomingText: "como no vas a saber!! que mal servicio",
      recentBotMessages: ["No tengo esa información confirmada todavía."],
      fallbackMessage: "No tengo esa información confirmada todavía."
    });
    expect(result.action).toBe("handoff");
    expect(result.action === "handoff" ? result.reason : null).toMatch(/complaint|customer_frustrated/);
  });

  it("hands off foundational question with low confidence", () => {
    const result = escalationDetectorService.evaluateLowConfidence({
      incomingText: "que venden?",
      ragScore: 0.1,
      confidenceThreshold: 0.7,
      handoffOnLowConfidence: false,
      recentBotMessages: [],
      hybridGreetingMessage: false,
      greetingLike: false
    });
    expect(result).toEqual({ action: "handoff", reason: "insufficient_context" });
  });

  it("allows one soft fallback before handoff on low confidence", () => {
    const result = escalationDetectorService.evaluateLowConfidence({
      incomingText: "tienen stock de algo raro?",
      ragScore: 0.2,
      confidenceThreshold: 0.7,
      handoffOnLowConfidence: false,
      recentBotMessages: [],
      hybridGreetingMessage: false,
      greetingLike: false
    });
    expect(result).toEqual({ action: "continue" });
  });

  it("hands off on second consecutive soft fallback", () => {
    const result = escalationDetectorService.evaluateLowConfidence({
      incomingText: "tienen stock de algo raro?",
      ragScore: 0.2,
      confidenceThreshold: 0.7,
      handoffOnLowConfidence: false,
      recentBotMessages: ["No tengo esa información confirmada todavía."],
      fallbackMessage: "No tengo esa información confirmada todavía.",
      hybridGreetingMessage: false,
      greetingLike: false
    });
    expect(result).toEqual({ action: "handoff", reason: "repeated_failure" });
  });

  it("hands off immediately when handoff_on_low_confidence is true", () => {
    const result = escalationDetectorService.evaluateLowConfidence({
      incomingText: "tienen stock de algo raro?",
      ragScore: 0.2,
      confidenceThreshold: 0.7,
      handoffOnLowConfidence: true,
      recentBotMessages: [],
      hybridGreetingMessage: false,
      greetingLike: false
    });
    expect(result).toEqual({ action: "handoff", reason: "low_rag_confidence" });
  });
});
