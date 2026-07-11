import { ConversationMode } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

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
    if (!input.botGlobalEnabled) {
      return { canRespond: false, reason: "bot_disabled" };
    }

    if (input.mode === ConversationMode.HUMAN) {
      if (input.botResumeAt && input.botResumeAt <= new Date()) {
        await prisma.conversation.update({
          where: { id: input.conversationId },
          data: { mode: ConversationMode.BOT, botResumeAt: null }
        });
        return { canRespond: true, resumedFromSchedule: true };
      }
      return { canRespond: false, reason: "human_mode" };
    }

    return { canRespond: true, resumedFromSchedule: false };
  }
}

export const decisionEngine = new DecisionEngine();
