import type { Request, Response } from "express";
import { paramId } from "../../utils/params.js";
import { AdminPhoneError } from "../admin-phone/admin-phone.errors.js";
import { adminPhoneService } from "../admin-phone/admin-phone.service.js";
import { paymentLinkService } from "../payments/payment-link.service.js";

export async function getPublicPaymentLink(req: Request, res: Response) {
  const code = paramId(req, "code");
  const result = await paymentLinkService.getPublicByCode(code);
  res.status(200).json(result);
}

export async function getPublicPhoneVerification(req: Request, res: Response) {
  const token = paramId(req, "token");
  const result = await adminPhoneService.getPublicByToken(token);
  res.status(200).json(result);
}

export async function confirmPublicPhoneVerification(req: Request, res: Response) {
  const token = paramId(req, "token");
  try {
    const result = await adminPhoneService.confirmByToken(token);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AdminPhoneError) {
      res.status(error.statusCode).json({
        ok: false,
        error: error.code,
        message: error.message
      });
      return;
    }
    throw error;
  }
}
