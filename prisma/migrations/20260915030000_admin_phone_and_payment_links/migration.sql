-- OTP al WhatsApp personal del admin + enlaces públicos /pay/:code

ALTER TABLE "TenantAdmin" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AdminPhoneVerification" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminPhoneVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminPhoneVerification_tenantId_phoneNumber_createdAt_idx"
  ON "AdminPhoneVerification"("tenantId", "phoneNumber", "createdAt");

ALTER TABLE "AdminPhoneVerification"
  ADD CONSTRAINT "AdminPhoneVerification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "PaymentLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "orderRef" TEXT NOT NULL,
  "destinationUrl" TEXT,
  "conversationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLink_code_key" ON "PaymentLink"("code");
CREATE INDEX IF NOT EXISTS "PaymentLink_tenantId_idx" ON "PaymentLink"("tenantId");

ALTER TABLE "PaymentLink"
  ADD CONSTRAINT "PaymentLink_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
