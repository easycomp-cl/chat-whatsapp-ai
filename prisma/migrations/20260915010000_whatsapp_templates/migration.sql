-- Pack estándar de plantillas WhatsApp (estado Meta) + content type TEMPLATE

ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'TEMPLATE';

CREATE TYPE "WhatsappTemplateStatus" AS ENUM (
  'NOT_CREATED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAUSED',
  'DISABLED'
);

CREATE TABLE "WhatsappTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "metaTemplateId" TEXT,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'es',
  "category" TEXT NOT NULL,
  "status" "WhatsappTemplateStatus" NOT NULL DEFAULT 'PENDING',
  "quality" TEXT,
  "rejectionReason" TEXT,
  "bodyPreview" TEXT NOT NULL,
  "variableCount" INTEGER NOT NULL DEFAULT 0,
  "componentsJson" JSONB NOT NULL DEFAULT '[]',
  "packKey" TEXT,
  "lastError" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "provisionedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsappTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappTemplate_tenantId_name_language_key"
  ON "WhatsappTemplate"("tenantId", "name", "language");
CREATE INDEX "WhatsappTemplate_tenantId_status_idx"
  ON "WhatsappTemplate"("tenantId", "status");
CREATE INDEX "WhatsappTemplate_metaTemplateId_idx"
  ON "WhatsappTemplate"("metaTemplateId");
CREATE INDEX "WhatsappTemplate_tenantId_packKey_idx"
  ON "WhatsappTemplate"("tenantId", "packKey");

ALTER TABLE "WhatsappTemplate"
ADD CONSTRAINT "WhatsappTemplate_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
