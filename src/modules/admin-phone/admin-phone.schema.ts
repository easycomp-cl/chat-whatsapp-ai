import { z } from "zod";

export const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Ingresa un teléfono válido en formato E.164 (ej. +56912345678).");

export const sendAdminPhoneVerificationSchema = z.object({
  phone: e164PhoneSchema
});

export const confirmAdminPhoneVerificationSchema = z.object({
  phone: e164PhoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "El código debe tener 6 dígitos.")
});

export type SendAdminPhoneVerificationInput = z.infer<typeof sendAdminPhoneVerificationSchema>;
export type ConfirmAdminPhoneVerificationInput = z.infer<typeof confirmAdminPhoneVerificationSchema>;
