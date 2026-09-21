import { z } from "zod";

const offeringDraftSchema = z.object({
  type: z.enum(["product", "service"]).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.number().nonnegative().nullable().optional(),
  currency: z.string().optional()
});

export const onboardingPatchSchema = z.object({
  current_step: z.number().int().min(1).max(5).optional(),
  identity: z
    .object({
      business_name: z.string().optional(),
      business_type: z.enum(["products", "services", "both"]).optional(),
      description: z.string().optional(),
      logo_url: z.union([z.string(), z.null()]).optional()
    })
    .optional(),
  offerings: z.array(offeringDraftSchema).optional(),
  operations: z
    .object({
      schedule: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
      commune: z.string().optional(),
      address: z.string().optional(),
      payment_methods: z.array(z.string()).optional(),
      delivery_notes: z.string().optional()
    })
    .optional(),
  human_contact: z
    .object({
      admin_name: z.string().optional(),
      admin_phone: z.string().optional(),
      notify_on_handoff: z.boolean().optional(),
      admin_phone_verified_at: z.string().nullable().optional()
    })
    .optional(),
  bot_identity: z
    .object({
      use_named_agent: z.boolean().optional(),
      bot_name: z.string().optional(),
      bot_tone: z.string().optional(),
      greeting_message: z.string().optional()
    })
    .optional()
});

export const onboardingCompleteSchema = z.object({
  enable_bot: z.boolean().default(true),
  handoff_on_low_confidence: z.boolean().default(true)
});
