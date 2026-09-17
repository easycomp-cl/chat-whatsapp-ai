import { z } from "zod";

export const productQuoteLineInputSchema = z.object({
  product_id: z.string().min(1),
  quantity: z.number().int().min(1).max(99)
});

export const productQuoteRequestSchema = z.object({
  lines: z.array(productQuoteLineInputSchema).min(1).max(30),
  customer_note: z.string().trim().max(280).optional(),
  delivery_method: z.enum(["none", "pickup", "delivery"]).optional(),
  commune: z.string().trim().max(120).optional(),
  caption: z.string().trim().max(1024).optional()
});

export type ProductQuoteRequestInput = z.infer<typeof productQuoteRequestSchema>;
