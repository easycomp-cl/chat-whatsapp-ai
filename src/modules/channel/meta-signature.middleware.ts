import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

export function validateMetaSignature(req: Request, res: Response, next: NextFunction) {
  if (env.SKIP_WEBHOOK_SIGNATURE) {
    next();
    return;
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!signature || typeof signature !== "string") {
    res.status(401).json({ error: "Missing signature" });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: "Raw body required for signature validation" });
    return;
  }

  const expected = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex")}`;

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      logger.warn("Invalid Meta webhook signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  next();
}
