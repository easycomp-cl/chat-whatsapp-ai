import type { Request, Response } from "express";
import { WhatsAppSendError } from "../channel/whatsapp.client.js";
import { paramId } from "../../utils/params.js";
import { AdminPhoneError } from "../admin-phone/admin-phone.errors.js";
import {
  confirmAdminPhoneVerificationSchema,
  sendAdminPhoneVerificationSchema
} from "../admin-phone/admin-phone.schema.js";
import { adminPhoneService } from "../admin-phone/admin-phone.service.js";

function sendAdminPhoneHttpError(res: Response, error: unknown): boolean {
  if (error instanceof AdminPhoneError) {
    res.status(error.statusCode).json({
      ok: false,
      error: error.code,
      message: error.message
    });
    return true;
  }
  if (error instanceof WhatsAppSendError) {
    res.status(error.isTokenExpired ? 503 : 502).json({
      ok: false,
      error: error.isTokenExpired ? "token_expired" : "whatsapp_send_failed",
      message: error.message
    });
    return true;
  }
  return false;
}

export async function sendAdminPhoneVerification(req: Request, res: Response) {
  const businessId = paramId(req, "id");
  const body = sendAdminPhoneVerificationSchema.parse(req.body ?? {});
  try {
    const result = await adminPhoneService.sendVerification(businessId, body.phone);
    res.status(200).json(result);
  } catch (error) {
    if (sendAdminPhoneHttpError(res, error)) return;
    throw error;
  }
}

export async function confirmAdminPhoneVerification(req: Request, res: Response) {
  const businessId = paramId(req, "id");
  const body = confirmAdminPhoneVerificationSchema.parse(req.body ?? {});
  try {
    const result = await adminPhoneService.confirmVerification(businessId, body.phone, body.code);
    res.status(200).json(result);
  } catch (error) {
    if (sendAdminPhoneHttpError(res, error)) return;
    throw error;
  }
}
