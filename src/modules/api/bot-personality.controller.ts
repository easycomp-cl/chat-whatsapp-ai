import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { paramId } from "../../utils/params.js";
import { setNoStore } from "../../lib/http-cache.js";
import {
  buildBotPersonalitySnapshot,
  mergeBotPersonalityConfigJson,
  type BotPersonalityPatch
} from "../tenants/bot-personality.service.js";

const warmthSchema = z.enum(["formal", "neutral", "warm"]);
const selectionSchema = z.enum(["random", "round_robin", "by_warmth"]);
const triggerSchema = z.enum([
  "greeting_pure",
  "greeting_returning",
  "thanks",
  "ack",
  "soft_fallback"
]);

const responseVariantSchema = z.object({
  text: z.string().min(1).max(500),
  warmth: warmthSchema.optional(),
  weight: z.number().positive().max(100).optional()
});

const conversationalResponseSetSchema = z.object({
  trigger: triggerSchema,
  variants: z.array(responseVariantSchema).max(20),
  selection: selectionSchema.default("random"),
  enabled: z.boolean().default(true)
});

const greetingConfigSchema = z.object({
  new_customer_warmth: warmthSchema.optional(),
  returning_customer_warmth: warmthSchema.optional(),
  returning_min_messages: z.number().int().min(1).max(100).optional(),
  combine_greeting_with_answers: z.boolean().optional()
});

const toneGreetingSchema = z.object({
  text: z.string().min(1).max(200),
  warmth: warmthSchema,
  source: z.string().max(120).optional(),
  usage_count: z.number().int().min(0).optional()
});

const patchBotPersonalitySchema = z.object({
  bot_name: z.string().min(1).max(80).optional(),
  bot_tone: z.string().min(1).max(200).optional(),
  greeting_message: z.string().min(1).max(500).optional(),
  fallback_message: z.string().min(1).max(500).optional(),
  handoff_message: z.string().min(1).max(500).optional(),
  out_of_hours_message: z.string().min(1).max(500).optional(),
  greeting_config: greetingConfigSchema.optional(),
  tone_greetings: z.array(toneGreetingSchema).max(20).optional(),
  conversational_responses: z.array(conversationalResponseSetSchema).max(10).optional(),
  handoff_on_low_confidence: z.boolean().optional()
});

export async function getBotPersonality(req: Request, res: Response) {
  const id = paramId(req, "id");
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { config: true }
  });
  if (!tenant?.config) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  setNoStore(res);
  res.json(
    buildBotPersonalitySnapshot({
      botName: tenant.config.botName,
      botTone: tenant.config.botTone,
      greetingMessage: tenant.config.greetingMessage,
      fallbackMessage: tenant.config.fallbackMessage,
      handoffMessage: tenant.config.handoffMessage,
      outOfHoursMessage: tenant.config.outOfHoursMessage,
      configJson: tenant.config.configJson
    })
  );
}

export async function patchBotPersonality(req: Request, res: Response) {
  const id = paramId(req, "id");
  const body = patchBotPersonalitySchema.parse(req.body);

  const existing = await prisma.tenant.findUnique({
    where: { id },
    include: { config: true }
  });
  if (!existing?.config) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const patch = body as BotPersonalityPatch;
  const configJson = mergeBotPersonalityConfigJson(existing.config.configJson, patch);

  const config = await prisma.tenantConfig.update({
    where: { tenantId: id },
    data: {
      ...(body.bot_name !== undefined && { botName: body.bot_name }),
      ...(body.bot_tone !== undefined && { botTone: body.bot_tone }),
      ...(body.greeting_message !== undefined && { greetingMessage: body.greeting_message }),
      ...(body.fallback_message !== undefined && { fallbackMessage: body.fallback_message }),
      ...(body.handoff_message !== undefined && { handoffMessage: body.handoff_message }),
      ...(body.out_of_hours_message !== undefined && {
        outOfHoursMessage: body.out_of_hours_message
      }),
      configJson
    }
  });

  setNoStore(res);
  res.json(
    buildBotPersonalitySnapshot({
      botName: config.botName,
      botTone: config.botTone,
      greetingMessage: config.greetingMessage,
      fallbackMessage: config.fallbackMessage,
      handoffMessage: config.handoffMessage,
      outOfHoursMessage: config.outOfHoursMessage,
      configJson: config.configJson
    })
  );
}
