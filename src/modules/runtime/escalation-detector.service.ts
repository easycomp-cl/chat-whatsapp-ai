import { detectHandoffReason, type HandoffReason } from "./prompts.js";
import { isFoundationalBusinessQuestion } from "./foundational-intent.js";
import { detectFrustrationSignals } from "./frustration-heuristics.js";
import {
  countConsecutiveSoftFallbacks,
  previousBotWasSoftFallback
} from "./conversation-escalation-state.js";

export type EscalationAction =
  | { action: "continue" }
  | { action: "handoff"; reason: HandoffReason };

export type EscalationPreInput = {
  incomingText: string;
  recentBotMessages: string[];
  fallbackMessage?: string;
};

export type EscalationLowConfidenceInput = {
  incomingText: string;
  ragScore: number;
  confidenceThreshold: number;
  handoffOnLowConfidence: boolean;
  recentBotMessages: string[];
  fallbackMessage?: string;
  hybridGreetingMessage: boolean;
  greetingLike: boolean;
  maxSoftFallbacksBeforeHandoff?: number;
};

const DEFAULT_MAX_SOFT_FALLBACKS = 3;

export class EscalationDetectorService {
  evaluatePreResponse(input: EscalationPreInput): EscalationAction {
    const explicit = detectHandoffReason(input.incomingText);
    if (explicit) {
      return { action: "handoff", reason: explicit };
    }

    const frustration = detectFrustrationSignals(input.incomingText, {
      previousBotWasSoftFallback: previousBotWasSoftFallback(
        input.recentBotMessages,
        input.fallbackMessage
      )
    });

    if (frustration.shouldEscalate) {
      const complaint = detectHandoffReason(input.incomingText);
      return {
        action: "handoff",
        reason: complaint === "complaint" ? "complaint" : "customer_frustrated"
      };
    }

    const consecutiveFallbacks = countConsecutiveSoftFallbacks(
      input.recentBotMessages,
      input.fallbackMessage
    );
    if (consecutiveFallbacks >= DEFAULT_MAX_SOFT_FALLBACKS) {
      return { action: "handoff", reason: "repeated_failure" };
    }

    return { action: "continue" };
  }

  evaluateLowConfidence(input: EscalationLowConfidenceInput): EscalationAction {
    const lowConfidence = input.ragScore < input.confidenceThreshold;

    if (!lowConfidence) {
      return { action: "continue" };
    }

    if (input.hybridGreetingMessage || input.greetingLike) {
      return { action: "continue" };
    }

    if (isFoundationalBusinessQuestion(input.incomingText)) {
      return { action: "handoff", reason: "insufficient_context" };
    }

    if (input.handoffOnLowConfidence) {
      return { action: "handoff", reason: "low_rag_confidence" };
    }

    const maxFallbacks = input.maxSoftFallbacksBeforeHandoff ?? DEFAULT_MAX_SOFT_FALLBACKS;
    const consecutiveFallbacks = countConsecutiveSoftFallbacks(
      input.recentBotMessages,
      input.fallbackMessage
    );

    if (consecutiveFallbacks >= maxFallbacks) {
      return { action: "handoff", reason: "repeated_failure" };
    }

    return { action: "continue" };
  }

  evaluateAiUncertainty(input: {
    hybridGreetingMessage: boolean;
    greetingLike: boolean;
    recentBotMessages: string[];
    fallbackMessage?: string;
  }): EscalationAction {
    if (input.hybridGreetingMessage || input.greetingLike) {
      const consecutiveFallbacks = countConsecutiveSoftFallbacks(
        input.recentBotMessages,
        input.fallbackMessage
      );
      if (consecutiveFallbacks >= DEFAULT_MAX_SOFT_FALLBACKS) {
        return { action: "handoff", reason: "repeated_failure" };
      }
      return { action: "continue" };
    }

    return { action: "handoff", reason: "ai_uncertain" };
  }
}

export const escalationDetectorService = new EscalationDetectorService();
