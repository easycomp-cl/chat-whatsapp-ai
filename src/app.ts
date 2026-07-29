import express from "express";
import { pinoHttp } from "pino-http";
import { ZodError } from "zod";
import { logger } from "./lib/logger.js";
import { assertDatabaseConnection, DATABASE_UNAVAILABLE_MESSAGE } from "./lib/prisma.js";
import { receiveWebhook, verifyWebhook } from "./modules/channel/whatsapp.controller.js";
import { validateMetaSignature } from "./modules/channel/meta-signature.middleware.js";
import { createApiRouter } from "./modules/api/router.js";
import { receiveFlowWebhook } from "./modules/api/flow-triggers.controller.js";
import { validateFlowWebhookSignature } from "./modules/flows/flow-webhook-signature.middleware.js";

export function createApp() {
  const app = express();

  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );
  app.use(pinoHttp({ logger }));

  app.get("/health", async (_req, res) => {
    try {
      await assertDatabaseConnection();
      res.status(200).json({ ok: true, db: "up" });
    } catch (error) {
      logger.error({ err: error }, DATABASE_UNAVAILABLE_MESSAGE);
      res.status(503).json({ ok: false, db: "down", message: DATABASE_UNAVAILABLE_MESSAGE });
    }
  });

  app.get("/webhooks/whatsapp", verifyWebhook);
  app.post("/webhooks/whatsapp", validateMetaSignature, receiveWebhook);
  app.post(
    "/webhooks/flows/:triggerId",
    validateFlowWebhookSignature,
    receiveFlowWebhook
  );

  app.use("/", createApiRouter());

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof ZodError) {
      const first = err.errors[0];
      res.status(400).json({
        error: first?.message ?? "Validation error",
        path: first?.path
      });
      return;
    }
    logger.error({ err }, "Unhandled request error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
