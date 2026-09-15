-- Módulo de Flujos Conversacionales (MVP)

DO $$ BEGIN
  CREATE TYPE "FlowDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlowTriggerType" AS ENUM ('MANUAL', 'AI_INTENT', 'KEYWORD', 'WEBHOOK', 'API');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlowRunStatus" AS ENUM (
    'RUNNING',
    'PAUSED',
    'AWAITING_CUSTOMER',
    'AWAITING_AGENT_INPUT',
    'AWAITING_REVIEW',
    'COMPLETED',
    'CANCELLED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlowReviewStatus" AS ENUM (
    'PENDING',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'CHANGES_REQUESTED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlowTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlowStartedBy" AS ENUM (
    'MANUAL',
    'TRIGGER_KEYWORD',
    'TRIGGER_INTENT',
    'TRIGGER_WEBHOOK',
    'TRIGGER_API',
    'SYSTEM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlowFileSource" AS ENUM ('WHATSAPP_INBOUND', 'AGENT_UPLOAD', 'FLOW_OUTPUT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "FlowDefinition" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "FlowDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersionId" TEXT,
  "createdByAdminId" TEXT NOT NULL,
  "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FlowDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowDefinitionId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "graphJson" JSONB NOT NULL,
  "status" "FlowVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FlowVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowTrigger" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowVersionId" TEXT NOT NULL,
  "triggerType" "FlowTriggerType" NOT NULL,
  "channel" "ConversationChannel",
  "priority" INTEGER NOT NULL DEFAULT 100,
  "configurationJson" JSONB NOT NULL DEFAULT '{}',
  "webhookSecretHash" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FlowTrigger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowVersionId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "currentNodeId" TEXT,
  "status" "FlowRunStatus" NOT NULL DEFAULT 'RUNNING',
  "variablesJson" JSONB NOT NULL DEFAULT '{}',
  "pendingAgentInputJson" JSONB,
  "startedBy" "FlowStartedBy" NOT NULL,
  "startedByAdminId" TEXT,
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowRunEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowRunId" TEXT NOT NULL,
  "nodeId" TEXT,
  "eventType" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "platformMessageId" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FlowRunEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowRunId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "reviewerAdminId" TEXT,
  "subjectType" TEXT NOT NULL,
  "subjectReference" TEXT,
  "status" "FlowReviewStatus" NOT NULL DEFAULT 'PENDING',
  "resolution" TEXT,
  "notes" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "FlowReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowRunId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "status" "FlowTaskStatus" NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FlowTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FlowFile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "flowRunId" TEXT,
  "conversationId" TEXT,
  "customerId" TEXT,
  "storageBucket" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT,
  "fileSize" INTEGER,
  "originalFilename" TEXT,
  "source" "FlowFileSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FlowFile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "activeFlowRunId" TEXT;

CREATE UNIQUE INDEX "FlowDefinition_currentVersionId_key" ON "FlowDefinition"("currentVersionId");
CREATE INDEX "FlowDefinition_tenantId_status_idx" ON "FlowDefinition"("tenantId", "status");
CREATE INDEX "FlowDefinition_tenantId_updatedAt_idx" ON "FlowDefinition"("tenantId", "updatedAt" DESC);

CREATE UNIQUE INDEX "FlowVersion_flowDefinitionId_versionNumber_key" ON "FlowVersion"("flowDefinitionId", "versionNumber");
CREATE INDEX "FlowVersion_tenantId_status_idx" ON "FlowVersion"("tenantId", "status");

CREATE INDEX "FlowTrigger_tenantId_triggerType_isEnabled_idx" ON "FlowTrigger"("tenantId", "triggerType", "isEnabled");
CREATE INDEX "FlowTrigger_flowVersionId_idx" ON "FlowTrigger"("flowVersionId");

CREATE INDEX "FlowRun_tenantId_status_idx" ON "FlowRun"("tenantId", "status");
CREATE INDEX "FlowRun_conversationId_status_idx" ON "FlowRun"("conversationId", "status");
CREATE INDEX "FlowRun_flowVersionId_idx" ON "FlowRun"("flowVersionId");

CREATE UNIQUE INDEX "FlowRunEvent_idempotencyKey_key" ON "FlowRunEvent"("idempotencyKey");
CREATE INDEX "FlowRunEvent_flowRunId_createdAt_idx" ON "FlowRunEvent"("flowRunId", "createdAt");
CREATE INDEX "FlowRunEvent_tenantId_eventType_idx" ON "FlowRunEvent"("tenantId", "eventType");

CREATE INDEX "FlowReview_tenantId_status_idx" ON "FlowReview"("tenantId", "status");
CREATE INDEX "FlowReview_flowRunId_status_idx" ON "FlowReview"("flowRunId", "status");

CREATE INDEX "FlowTask_tenantId_status_idx" ON "FlowTask"("tenantId", "status");
CREATE INDEX "FlowTask_flowRunId_status_idx" ON "FlowTask"("flowRunId", "status");

CREATE UNIQUE INDEX "FlowFile_storageBucket_storagePath_key" ON "FlowFile"("storageBucket", "storagePath");
CREATE INDEX "FlowFile_tenantId_flowRunId_idx" ON "FlowFile"("tenantId", "flowRunId");
CREATE INDEX "FlowFile_conversationId_idx" ON "FlowFile"("conversationId");

CREATE UNIQUE INDEX "Conversation_activeFlowRunId_key" ON "Conversation"("activeFlowRunId");

-- Solo un run activo por conversación (estados terminales excluidos)
CREATE UNIQUE INDEX "FlowRun_one_active_per_conversation_idx"
  ON "FlowRun" ("conversationId")
  WHERE "status" NOT IN ('COMPLETED', 'CANCELLED', 'FAILED');

ALTER TABLE "FlowDefinition"
  ADD CONSTRAINT "FlowDefinition_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowDefinition_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "TenantAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowDefinition_updatedByAdminId_fkey"
    FOREIGN KEY ("updatedByAdminId") REFERENCES "TenantAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowDefinition_currentVersionId_fkey"
    FOREIGN KEY ("currentVersionId") REFERENCES "FlowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FlowVersion"
  ADD CONSTRAINT "FlowVersion_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowVersion_flowDefinitionId_fkey"
    FOREIGN KEY ("flowDefinitionId") REFERENCES "FlowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowVersion_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "TenantAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FlowTrigger"
  ADD CONSTRAINT "FlowTrigger_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowTrigger_flowVersionId_fkey"
    FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlowRun"
  ADD CONSTRAINT "FlowRun_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowRun_flowVersionId_fkey"
    FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowRun_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowRun_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowRun_startedByAdminId_fkey"
    FOREIGN KEY ("startedByAdminId") REFERENCES "TenantAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FlowRunEvent"
  ADD CONSTRAINT "FlowRunEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowRunEvent_flowRunId_fkey"
    FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlowReview"
  ADD CONSTRAINT "FlowReview_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowReview_flowRunId_fkey"
    FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowReview_reviewerAdminId_fkey"
    FOREIGN KEY ("reviewerAdminId") REFERENCES "TenantAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FlowTask"
  ADD CONSTRAINT "FlowTask_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowTask_flowRunId_fkey"
    FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlowFile"
  ADD CONSTRAINT "FlowFile_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowFile_flowRunId_fkey"
    FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowFile_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FlowFile_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_activeFlowRunId_fkey"
    FOREIGN KEY ("activeFlowRunId") REFERENCES "FlowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
