import type { Request, Response } from "express";
import { z } from "zod";
import { ConversationMode } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { handoffService } from "../runtime/handoff.service.js";
import { usageEventsService, USAGE_EVENT_TYPES } from "../metrics/usage-events.service.js";
import { paramId } from "../../utils/params.js";

export async function listConversations(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const conversations = await prisma.conversation.findMany({
    where: { tenantId: businessId },
    include: { customer: true },
    orderBy: { lastMessageAt: "desc" },
    take: 50
  });
  res.json(conversations);
}

export async function getConversation(req: Request, res: Response) {
  const id = paramId(req, "id");
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "asc" }, take: 100 }
    }
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json(conversation);
}

const modeSchema = z.object({
  mode: z.enum(["BOT", "HUMAN"]),
  bot_resume_at: z.string().datetime().optional()
});

export async function patchConversationMode(req: Request, res: Response) {
  const id = paramId(req, "id");
  const body = modeSchema.parse(req.body);
  const botResumeAt = body.bot_resume_at ? new Date(body.bot_resume_at) : null;

  if (body.mode === "BOT") {
    await handoffService.enableBotMode(id, botResumeAt);
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (conversation) {
      await usageEventsService.track({
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        eventType: USAGE_EVENT_TYPES.BOT_ENABLED
      });
    }
  } else {
    await prisma.conversation.update({
      where: { id },
      data: { mode: ConversationMode.HUMAN, botResumeAt }
    });
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (conversation) {
      await usageEventsService.track({
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        eventType: USAGE_EVENT_TYPES.BOT_DISABLED
      });
    }
  }

  const updated = await prisma.conversation.findUnique({ where: { id } });
  res.json(updated);
}
