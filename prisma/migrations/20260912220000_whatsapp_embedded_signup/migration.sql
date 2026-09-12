-- Embedded Signup: sesión OAuth (codes de un solo uso) + metadatos del canal WhatsApp

CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

ALTER TABLE "TenantChannel" ADD COLUMN "metaBusinessId" TEXT;
ALTER TABLE "TenantChannel" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "TenantChannel" ADD COLUMN "lastError" TEXT;

CREATE TABLE "WhatsAppConnectionSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "codeHash" TEXT NOT NULL,
  "wabaId" TEXT,
  "phoneNumberId" TEXT,
  "phoneNumber" TEXT,
  "metaBusinessId" TEXT,
  "lastError" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppConnectionSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConnectionSession_codeHash_key" ON "WhatsAppConnectionSession"("codeHash");
CREATE INDEX "WhatsAppConnectionSession_tenantId_status_idx" ON "WhatsAppConnectionSession"("tenantId", "status");
CREATE INDEX "WhatsAppConnectionSession_phoneNumberId_idx" ON "WhatsAppConnectionSession"("phoneNumberId");

ALTER TABLE "WhatsAppConnectionSession"
ADD CONSTRAINT "WhatsAppConnectionSession_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
