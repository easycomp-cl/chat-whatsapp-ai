import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

export const embeddedSignupCompleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const bodyTenant =
      req.body && typeof req.body === "object" && "tenant_id" in req.body
        ? String((req.body as { tenant_id?: unknown }).tenant_id ?? "")
        : "";
    const paramTenant =
      typeof req.params.id === "string"
        ? req.params.id
        : typeof req.params.businessId === "string"
          ? req.params.businessId
          : "";
    const tenant = bodyTenant || paramTenant || req.ip || "unknown";
    return `wa-es:${tenant}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      ok: false,
      error: "too_many_requests",
      message: "Demasiados intentos de conexión de WhatsApp. Espera unos minutos e inténtalo de nuevo."
    });
  }
});
