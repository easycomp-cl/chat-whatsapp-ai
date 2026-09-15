import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

export const adminPhoneVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const tenant = typeof req.params.id === "string" ? req.params.id : req.ip || "unknown";
    const phone =
      req.body && typeof req.body === "object" && "phone" in req.body
        ? String((req.body as { phone?: unknown }).phone ?? "")
        : "";
    return `admin-otp:${tenant}:${phone || req.ip || "unknown"}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      error: "too_many_requests",
      message: "Demasiados intentos de verificación. Espera unos minutos e inténtalo de nuevo."
    });
  }
});
