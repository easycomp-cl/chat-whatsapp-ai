import { Worker } from "bullmq";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { bullmqConnection, bullmqWorkerOptions } from "./bullmq.config.js";
import {
  TOKEN_EXPIRATION_CHECK_QUEUE_NAME,
  tokenExpirationCheckQueue,
  type TokenExpirationCheckJobData
} from "./token-expiration-check.queue.js";

let worker: Worker<TokenExpirationCheckJobData> | null = null;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function checkTokenExpiration() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + SEVEN_DAYS_MS);

  const expiringChannels = await prisma.tenantChannel.findMany({
    where: {
      isActive: true,
      status: "ACTIVE",
      tokenExpiresAt: {
        lte: sevenDaysFromNow,
        not: null
      }
    },
    select: {
      id: true,
      tenantId: true,
      phoneNumberId: true,
      phoneNumber: true,
      tokenExpiresAt: true
    }
  });

  if (expiringChannels.length === 0) {
    logger.info("Token expiration check: no expiring tokens found");
    return;
  }

  for (const channel of expiringChannels) {
    const daysUntilExpiry = channel.tokenExpiresAt
      ? Math.ceil((channel.tokenExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    if (daysUntilExpiry <= 0) {
      logger.warn(
        {
          tenantId: channel.tenantId,
          phoneNumberId: channel.phoneNumberId,
          phoneNumber: channel.phoneNumber,
          tokenExpiresAt: channel.tokenExpiresAt
        },
        "WhatsApp access token EXPIRED - reconnection required"
      );
    } else {
      logger.warn(
        {
          tenantId: channel.tenantId,
          phoneNumberId: channel.phoneNumberId,
          phoneNumber: channel.phoneNumber,
          tokenExpiresAt: channel.tokenExpiresAt,
          daysUntilExpiry
        },
        `WhatsApp access token expiring in ${daysUntilExpiry} day(s) - reconnection recommended`
      );
    }
  }

  logger.info(
    { totalExpiringOrExpired: expiringChannels.length },
    "Token expiration check completed"
  );
}

export function startTokenExpirationCheckWorker() {
  if (worker) return worker;

  worker = new Worker<TokenExpirationCheckJobData>(
    TOKEN_EXPIRATION_CHECK_QUEUE_NAME,
    async () => {
      await checkTokenExpiration();
    },
    {
      connection: bullmqConnection,
      concurrency: 1,
      ...bullmqWorkerOptions
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      "Token expiration check worker job failed"
    );
  });

  return worker;
}

export async function stopTokenExpirationCheckWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
}

export async function scheduleTokenExpirationCheck() {
  const existingRepeatable = await tokenExpirationCheckQueue.getRepeatableJobs();
  const alreadyScheduled = existingRepeatable.some(
    (job) => job.id === "token-expiration-check-daily" || job.key?.includes("token-expiration-check-daily")
  );

  if (alreadyScheduled) {
    logger.info("Token expiration check already scheduled; skipping duplicate");
    return;
  }

  await tokenExpirationCheckQueue.add(
    "check-token-expiration",
    {},
    {
      repeat: {
        pattern: "0 9 * * *"
      },
      jobId: "token-expiration-check-daily"
    }
  );
  logger.info("Token expiration check scheduled to run daily at 9:00 AM");
}
