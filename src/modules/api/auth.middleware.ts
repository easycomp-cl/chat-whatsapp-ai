import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";

export function requireInternalApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] ?? req.headers.authorization?.replace("Bearer ", "");
  if (apiKey !== env.INTERNAL_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
