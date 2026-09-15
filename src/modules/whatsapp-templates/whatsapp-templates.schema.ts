import { z } from "zod";

const templateParameterSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(1024)
});

const templateComponentSchema = z.object({
  type: z.string().min(1),
  sub_type: z.string().optional(),
  index: z.union([z.string(), z.number()]).optional(),
  parameters: z.array(templateParameterSchema).optional()
});

export const sendConversationTemplateSchema = z
  .object({
    template_name: z.string().min(1),
    language_code: z.string().min(2).max(10).optional(),
    components: z.array(templateComponentSchema).optional(),
    body_parameters: z.array(z.string().min(1).max(1024)).optional(),
    button_parameters: z.array(z.string().min(1).max(1024)).optional(),
    agent_phone: z.string().optional(),
    reply_to_message_id: z.string().optional()
  })
  .refine(
    (value) => value.components !== undefined || value.body_parameters !== undefined,
    { message: "Indica body_parameters o components para la plantilla." }
  );

export const listTemplatesQuerySchema = z.object({
  status: z.string().optional()
});

export type SendConversationTemplateInput = z.infer<typeof sendConversationTemplateSchema>;
