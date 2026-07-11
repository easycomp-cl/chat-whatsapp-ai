-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop deprecated tables
DROP TABLE IF EXISTS "AdminSession" CASCADE;
DROP TABLE IF EXISTS "AdminConversationLink" CASCADE;
DROP TABLE IF EXISTS "OnboardingAnswer" CASCADE;
DROP TABLE IF EXISTS "OnboardingSession" CASCADE;
DROP TABLE IF EXISTS "EmbeddedSignupSession" CASCADE;
DROP TABLE IF EXISTS "Lead" CASCADE;
DROP TABLE IF EXISTS "Appointment" CASCADE;
DROP TABLE IF EXISTS "Quote" CASCADE;
DROP TABLE IF EXISTS "Sale" CASCADE;
DROP TABLE IF EXISTS "TenantProduct" CASCADE;
DROP TABLE IF EXISTS "TenantService" CASCADE;

-- Drop deprecated enums
DROP TYPE IF EXISTS "OnboardingStatus";
DROP TYPE IF EXISTS "EmbeddedSignupStatus";
DROP TYPE IF EXISTS "LeadStatus";
DROP TYPE IF EXISTS "AppointmentStatus";
DROP TYPE IF EXISTS "QuoteStatus";
DROP TYPE IF EXISTS "LinkStatus";
DROP TYPE IF EXISTS "AdminSessionType";
DROP TYPE IF EXISTS "AdminSessionStatus";

-- Update TenantStatus enum
ALTER TYPE "TenantStatus" RENAME TO "TenantStatus_old";
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'PAUSED');
ALTER TABLE "Tenant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "status" TYPE "TenantStatus" USING (
  CASE
    WHEN "status"::text IN ('ACTIVE') THEN 'ACTIVE'::"TenantStatus"
    ELSE 'PAUSED'::"TenantStatus"
  END
);
ALTER TABLE "Tenant" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "TenantStatus_old";

-- Update ChannelType enum
ALTER TYPE "ChannelType" RENAME TO "ChannelType_old";
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP_BUSINESS');
ALTER TABLE "TenantChannel" ALTER COLUMN "channelType" DROP DEFAULT;
ALTER TABLE "TenantChannel" ALTER COLUMN "channelType" TYPE "ChannelType" USING 'WHATSAPP_BUSINESS'::"ChannelType";
ALTER TABLE "TenantChannel" ALTER COLUMN "channelType" SET DEFAULT 'WHATSAPP_BUSINESS';
DROP TYPE "ChannelType_old";

-- Update SenderType enum (ADMIN -> HUMAN)
ALTER TYPE "SenderType" RENAME TO "SenderType_old";
CREATE TYPE "SenderType" AS ENUM ('CUSTOMER', 'BOT', 'HUMAN', 'SYSTEM');
ALTER TABLE "Message" ALTER COLUMN "senderType" TYPE "SenderType" USING (
  CASE
    WHEN "senderType"::text = 'ADMIN' THEN 'HUMAN'::"SenderType"
    ELSE "senderType"::text::"SenderType"
  END
);
DROP TYPE "SenderType_old";

-- Tenant extensions
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "slug" TEXT;
UPDATE "Tenant" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "botGlobalEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "defaultAiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.70;

-- TenantChannel extensions
CREATE TYPE "ChannelStatus" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "TenantChannel" ADD COLUMN IF NOT EXISTS "accessTokenEncrypted" TEXT;
ALTER TABLE "TenantChannel" ADD COLUMN IF NOT EXISTS "verifyToken" TEXT;
ALTER TABLE "TenantChannel" ADD COLUMN IF NOT EXISTS "coexistenceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantChannel" ADD COLUMN IF NOT EXISTS "status" "ChannelStatus" NOT NULL DEFAULT 'ACTIVE';

-- TenantAdmin extensions
ALTER TABLE "TenantAdmin" ADD COLUMN IF NOT EXISTS "notifyOnHandoff" BOOLEAN NOT NULL DEFAULT true;

-- TenantConfig cleanup
ALTER TABLE "TenantConfig" DROP COLUMN IF EXISTS "enableRag";
ALTER TABLE "TenantConfig" DROP COLUMN IF EXISTS "enableLeadCapture";
ALTER TABLE "TenantConfig" DROP COLUMN IF EXISTS "enableBooking";
ALTER TABLE "TenantConfig" DROP COLUMN IF EXISTS "enableQuotes";
ALTER TABLE "TenantConfig" DROP COLUMN IF EXISTS "enableSuggestions";

-- TenantFaq extensions
ALTER TABLE "TenantFaq" DROP COLUMN IF EXISTS "source";
ALTER TABLE "TenantFaq" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "TenantFaq" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenantFaq" ADD COLUMN IF NOT EXISTS "questionEmbedding" vector(1536);

-- TenantDocument refactor
CREATE TYPE "KnowledgeSourceType" AS ENUM ('PDF', 'DOCX', 'TXT', 'MANUAL', 'URL');
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('PENDING', 'INDEXED', 'ERROR');

ALTER TABLE "TenantDocument" RENAME COLUMN "contentText" TO "rawText";
ALTER TABLE "TenantDocument" DROP COLUMN IF EXISTS "fileType";
ALTER TABLE "TenantDocument" ADD COLUMN IF NOT EXISTS "sourceType" "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "TenantDocument" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantDocument" ALTER COLUMN "status" TYPE "KnowledgeDocumentStatus" USING (
  CASE
    WHEN "status"::text = 'indexed' THEN 'INDEXED'::"KnowledgeDocumentStatus"
    WHEN "status"::text = 'error' THEN 'ERROR'::"KnowledgeDocumentStatus"
    ELSE 'PENDING'::"KnowledgeDocumentStatus"
  END
);
ALTER TABLE "TenantDocument" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- KnowledgeChunk table
CREATE TABLE "KnowledgeChunk" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkText" TEXT NOT NULL,
  "embedding" vector(1536),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KnowledgeChunk_tenantId_idx" ON "KnowledgeChunk"("tenantId");
CREATE INDEX "KnowledgeChunk_documentId_idx" ON "KnowledgeChunk"("documentId");
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TenantDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Customer cleanup
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "address";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "notes";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "tagsJson";

-- Conversation extensions
CREATE TYPE "ConversationChannel" AS ENUM ('WHATSAPP');
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "channel" "ConversationChannel" NOT NULL DEFAULT 'WHATSAPP';
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "handoffReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "botResumeAt" TIMESTAMP(3);
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "currentIntent";
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "summary";

-- Message extensions
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "direction" "MessageDirection" NOT NULL DEFAULT 'INBOUND';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiGenerated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD CONSTRAINT "Message_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UsageEvent table
CREATE TABLE "UsageEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT,
  "eventType" TEXT NOT NULL,
  "tokensInput" INTEGER,
  "tokensOutput" INTEGER,
  "estimatedCost" DOUBLE PRECISION,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UsageEvent_tenantId_eventType_idx" ON "UsageEvent"("tenantId", "eventType");
CREATE INDEX "UsageEvent_tenantId_createdAt_idx" ON "UsageEvent"("tenantId", "createdAt");
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vector index for semantic search
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_idx" ON "KnowledgeChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
