import pino from "pino";
import { env } from "../config/env.js";

const options: pino.LoggerOptions =
  env.NODE_ENV === "development"
    ? {
        level: "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true }
        }
      }
    : { level: "info" };

export const logger = pino(options);
