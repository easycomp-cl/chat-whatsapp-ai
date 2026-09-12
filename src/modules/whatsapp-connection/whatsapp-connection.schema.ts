import { z } from "zod";

export const embeddedSignupCompleteSchema = z.object({
  code: z.string().min(8, "code es obligatorio"),
  waba_id: z.string().min(1, "waba_id es obligatorio"),
  phone_number_id: z.string().min(1, "phone_number_id es obligatorio"),
  business_id: z.string().min(1).optional(),
  tenant_id: z.string().min(1).optional(),
  redirect_uri: z.string().url().optional()
});

export const whatsappConnectionQuerySchema = z.object({
  tenant_id: z.string().min(1).optional()
});

export const whatsappTestMessageSchema = z.object({
  tenant_id: z.string().min(1).optional(),
  to: z.string().min(8, "to debe ser un número WhatsApp (Tester)"),
  text: z.string().min(1).max(1000).optional()
});

export type EmbeddedSignupCompleteInput = z.infer<typeof embeddedSignupCompleteSchema>;
export type WhatsappTestMessageInput = z.infer<typeof whatsappTestMessageSchema>;
