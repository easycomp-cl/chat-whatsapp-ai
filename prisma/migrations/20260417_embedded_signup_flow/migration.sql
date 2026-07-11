ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'PENDING_WHATSAPP_CONNECTION';

CREATE TYPE "EmbeddedSignupStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');

CREATE TABLE "EmbeddedSignupSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "adminPhone" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "status" "EmbeddedSignupStatus" NOT NULL DEFAULT 'PENDING',
  "wabaId" TEXT,
  "phoneNumberId" TEXT,
  "phoneNumber" TEXT,
  "lastError" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmbeddedSignupSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmbeddedSignupSession_sessionToken_key" ON "EmbeddedSignupSession"("sessionToken");
CREATE INDEX "EmbeddedSignupSession_tenantId_status_idx" ON "EmbeddedSignupSession"("tenantId", "status");

ALTER TABLE "EmbeddedSignupSession"
ADD CONSTRAINT "EmbeddedSignupSession_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
