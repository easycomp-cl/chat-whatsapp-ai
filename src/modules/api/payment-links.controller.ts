import type { Request, Response } from "express";
import { paramId } from "../../utils/params.js";
import { paymentLinkService } from "../payments/payment-link.service.js";

export async function getPublicPaymentLink(req: Request, res: Response) {
  const code = paramId(req, "code");
  const result = await paymentLinkService.getPublicByCode(code);
  res.status(200).json(result);
}
