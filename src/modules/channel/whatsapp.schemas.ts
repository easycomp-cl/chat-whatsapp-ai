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

export const editedInnerMessageSchema = z.object({
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ caption: z.string().optional() }).optional(),
  video: z.object({ caption: z.string().optional() }).optional(),
  document: z.object({ caption: z.string().optional() }).optional()
});

const editMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("edit"),
  edit: z.object({
    original_message_id: z.string(),
    message: editedInnerMessageSchema
  })
});

const revokeMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("revoke"),
  revoke: z.object({
    original_message_id: z.string()
  })
});

const mediaObjectSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional()
});

const imageMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("image"),
  image: mediaObjectSchema,
  context: contextSchema.optional()
});

const documentMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("document"),
  document: mediaObjectSchema,
  context: contextSchema.optional()
});

const audioMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("audio"),
  audio: mediaObjectSchema,
  context: contextSchema.optional()
});

const voiceMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("voice"),
  audio: mediaObjectSchema,
  context: contextSchema.optional()
});

const interactiveInboundMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string().optional(),
  type: z.literal("interactive"),
  interactive: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("button_reply"),
      button_reply: z.object({
        id: z.string(),
        title: z.string()
      })
    }),
    z.object({
      type: z.literal("list_reply"),
      list_reply: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().optional()
      })
    })
  ]),
  context: contextSchema.optional()
});

const inboundMessageSchema = z.union([
  reactionMessageSchema,
  editMessageSchema,
  revokeMessageSchema,
  interactiveInboundMessageSchema,
  imageMessageSchema,
  documentMessageSchema,
  audioMessageSchema,
  voiceMessageSchema,
  textMessageSchema
]);

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
            messages: z.array(inboundMessageSchema).optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                  timestamp: z.string().optional(),
                  recipient_id: z.string().optional(),
                  errors: z
                    .array(
                      z.object({
                        code: z.number().optional(),
                        title: z.string().optional(),
                        message: z.string().optional(),
                        error_data: z
                          .object({
                            details: z.string().optional()
                          })
                          .optional()
                      })
                    )
                    .optional()
                })
              )
              .optional()
          })
        })
      )
    })
  )
});
