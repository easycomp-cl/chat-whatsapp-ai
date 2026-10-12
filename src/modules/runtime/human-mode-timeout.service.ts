import { ConversationMode, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { systemEventService } from "../conversations/system-event.service.js";
import { buildSystemEvent } from "../conversations/system-event-copy.js";
import {
  BOT_MODE_RESUMED_VISIBLE_TEXT,
  computeHumanModeUntil,
  HUMAN_MODE_TIMEOUT_MS,
  isHumanModeTimeoutDue
} from "../conversations/human-mode-until.js";

export type ResumeIfDueResult = {
  resumed: boolean;
  mode: ConversationMode;
};

function botModeResumedEvent(source: string) {
  return buildSystemEvent("bot_mode_resumed", "BOT", BOT_MODE_RESUMED_VISIBLE_TEXT, {
    source,
    timeout_minutes: 30
  });
}

export class HumanModeTimeoutService {
  computeResumeAt(from: Date = new Date()): Date {
    return computeHumanModeUntil(from);
  }

  async refreshCountdown(conversationId: string, now: Date = new Date()): Promise<Date | null> {
    const botResumeAt = computeHumanModeUntil(now);
    const result = await prisma.conversation.updateMany({
      where: { id: conversationId, mode: ConversationMode.HUMAN },
      data: { botResumeAt }
    });
    return result.count > 0 ? botResumeAt : null;
  }

  async resumeIfDue(
    conversationId: string,
    now: Date = new Date()
  ): Promise<ResumeIfDueResult> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, mode: true, botResumeAt: true, updatedAt: true }
    });
    if (!conversation) {
      return { resumed: false, mode: ConversationMode.BOT };
    }
    if (conversation.mode !== ConversationMode.HUMAN) {
      return { resumed: false, mode: conversation.mode };
    }
    if (
      !isHumanModeTimeoutDue({
        botResumeAt: conversation.botResumeAt,
        fallbackActivityAt: conversation.updatedAt,
        now
      })
    ) {
      return { resumed: false, mode: ConversationMode.HUMAN };
    }

    const resumed = await this.flipExpiredToBot(conversationId, conversation.botResumeAt, now);
    if (resumed) {
      return { resumed: true, mode: ConversationMode.BOT };
    }

    const latest = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { mode: true }
    });
    return {
      resumed: false,
      mode: latest?.mode ?? ConversationMode.HUMAN
    };
  }

  async processExpiredConversations(now: Date = new Date()): Promise<{ resumed: number }> {
    const staleBefore = new Date(now.getTime() - HUMAN_MODE_TIMEOUT_MS);
    const expired = await prisma.conversation.findMany({
      where: {
        mode: ConversationMode.HUMAN,
        OR: [{ botResumeAt: { lte: now } }, { botResumeAt: null, updatedAt: { lte: staleBefore } }]
      },
      select: { id: true }
    });

    let resumed = 0;
    for (const row of expired) {
      const result = await this.resumeIfDue(row.id, now);
      if (result.resumed) {
        resumed += 1;
      }
    }

    logger.info(
      { candidates: expired.length, resumed },
      "Human mode timeout check completed"
    );
    return { resumed };
  }

  private async flipExpiredToBot(
    conversationId: string,
    botResumeAt: Date | null,
    now: Date
  ): Promise<boolean> {
    const staleBefore = new Date(now.getTime() - HUMAN_MODE_TIMEOUT_MS);
    const where: Prisma.ConversationWhereInput = botResumeAt
      ? { id: conversationId, mode: ConversationMode.HUMAN, botResumeAt: { lte: now } }
      : {
          id: conversationId,
          mode: ConversationMode.HUMAN,
          botResumeAt: null,
          updatedAt: { lte: staleBefore }
        };

    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.conversation.updateMany({
          where,
          data: {
            mode: ConversationMode.BOT,
            botResumeAt: null,
            handoffReason: null,
            assignedAdminId: null
          }
        });
        if (updated.count === 0) {
          return false;
        }
        await systemEventService.appendForConversation(
          conversationId,
          botModeResumedEvent("human_mode_timeout"),
          tx
        );
        return true;
      });
    } catch (error) {
      logger.error({ err: error, conversationId }, "Failed to resume conversation from human mode timeout");
      throw error;
    }
  }
}

export const humanModeTimeoutService = new HumanModeTimeoutService();
