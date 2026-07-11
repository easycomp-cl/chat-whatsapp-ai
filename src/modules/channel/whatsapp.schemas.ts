import { z } from "zod";

export const webhookVerificationQuerySchema = z.object({
  "hub.mode": z.string().optional(),
  "hub.challenge": z.string().optional(),
  "hub.verify_token": z.string().optional()
});

const contextSchema = z.object({
  from: z.string().optional(),
  id: z.string(),
  referred_product: z.unknown().nullable().optional()
});

const textMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.string().optional(),
  text: z
    .object({
      body: z.string()
    })
    .optional(),
  context: contextSchema.optional()
});

const reactionMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("reaction"),
  reaction: z.object({
    message_id: z.string(),
    emoji: z.string()
  })
});

const inboundMessageSchema = z.union([reactionMessageSchema, textMessageSchema]);

export const whatsappWebhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z
              .object({
                display_phone_number: z.string().optional(),
                phone_number_id: z.string()
              })
              .optional(),
            contacts: z
              .array(
                z.object({
                  profile: z
                    .object({
                      name: z.string().optional()
                    })
                    .optional()
                })
              )
              .optional(),
            messages: z.array(inboundMessageSchema).optional()
          })
        })
      )
    })
  )
});
