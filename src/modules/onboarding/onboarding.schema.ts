import { z } from "zod";

const offeringSchema = z.object({
  type: z.enum(["product", "service"]).default("product"),
  name: z.string().min(1),
  description: z.string().min(10),
  price: z.number().nonnegative().optional(),
  currency: z.string().default("CLP")
});

export const onboardingPatchSchema = z.object({
  identity: z
    .object({
      business_type: z.enum(["products", "services", "both"]).optional(),
      description: z.string().min(1).optional()
    })
    .optional(),
  offerings: z.array(offeringSchema).optional(),
  operations: z
    .object({
      schedule: z.string().min(1).optional(),
      city: z.string().min(1).optional(),
      commune: z.string().optional(),
      address: z.string().optional(),
      payment_methods: z.array(z.string().min(1)).optional(),
      delivery_notes: z.string().optional()
    })
    .optional(),
  human_contact: z
    .object({
      admin_name: z.string().min(1).optional(),
      admin_phone: z.string().min(8).optional(),
      notify_on_handoff: z.boolean().optional()
    })
    .optional(),
  bot_identity: z
    .object({
      bot_name: z.string().min(1).optional(),
      bot_tone: z.string().min(1).optional(),
      greeting_message: z.string().min(1).optional()
    })
    .optional()
});

export const onboardingCompleteSchema = z.object({
  enable_bot: z.boolean().default(true),
  handoff_on_low_confidence: z.boolean().default(true)
});
