import { ConversationMode } from "@prisma/client";
import { isBotRuntimeBlocked } from "../onboarding/onboarding-config.js";
import { humanModeTimeoutService } from "../runtime/human-mode-timeout.service.js";

export type DecisionResult =
  | { canRespond: false; reason: "bot_disabled" | "human_mode" }
  | { canRespond: true; resumedFromSchedule: boolean };

export class DecisionEngine {
  async evaluate(input: {
    tenantId: string;
    botGlobalEnabled: boolean;
    conversationId: string;
    mode: ConversationMode;
    botResumeAt: Date | null;
  }): Promise<DecisionResult> {
    if (isBotRuntimeBlocked(input.botGlobalEnabled)) {
      return { canRespond: false, reason: "bot_disabled" };
    }

    if (input.mode === ConversationMode.HUMAN) {
      const result = await humanModeTimeoutService.resumeIfDue(input.conversationId);
      if (result.mode === ConversationMode.BOT) {
        return { canRespond: true, resumedFromSchedule: result.resumed };
      }
      return { canRespond: false, reason: "human_mode" };
    }

    return { canRespond: true, resumedFromSchedule: false };
  }
}

export const decisionEngine = new DecisionEngine();
