-- Add metadata for minimal business-only samples (no full chat retention)
ALTER TABLE "ChatImportJob" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "ChatImportJob_tenantId_createdAt_idx" ON "ChatImportJob"("tenantId", "createdAt" DESC);
