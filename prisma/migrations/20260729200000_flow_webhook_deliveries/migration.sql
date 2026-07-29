-- Webhooks salientes de flujos (PR8)
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'FLOW_WEBHOOK';

CREATE TYPE "FlowWebhookDeliveryStatus" AS ENUM (
  'PENDING',
  'DELIVERING',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER'
);

CREATE TABLE "FlowWebhookDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowRunId" TEXT NOT NULL,
  "flowRunEventId" TEXT,
  "nodeId" TEXT,
  "eventType" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "status" "FlowWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lastHttpStatus" INTEGER,
  "lastError" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FlowWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowWebhookDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "httpStatus" INTEGER,
  "responseBody" TEXT,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FlowWebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FlowWebhookDelivery_tenantId_status_createdAt_idx"
  ON "FlowWebhookDelivery"("tenantId", "status", "createdAt" DESC);
CREATE INDEX "FlowWebhookDelivery_flowRunId_createdAt_idx"
  ON "FlowWebhookDelivery"("flowRunId", "createdAt" DESC);
CREATE INDEX "FlowWebhookDelivery_flowRunEventId_idx"
  ON "FlowWebhookDelivery"("flowRunEventId");
CREATE INDEX "FlowWebhookDeliveryAttempt_deliveryId_attemptNumber_idx"
  ON "FlowWebhookDeliveryAttempt"("deliveryId", "attemptNumber");

ALTER TABLE "FlowWebhookDelivery"
  ADD CONSTRAINT "FlowWebhookDelivery_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowWebhookDelivery"
  ADD CONSTRAINT "FlowWebhookDelivery_flowRunId_fkey"
  FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowWebhookDelivery"
  ADD CONSTRAINT "FlowWebhookDelivery_flowRunEventId_fkey"
  FOREIGN KEY ("flowRunEventId") REFERENCES "FlowRunEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FlowWebhookDeliveryAttempt"
  ADD CONSTRAINT "FlowWebhookDeliveryAttempt_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "FlowWebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
