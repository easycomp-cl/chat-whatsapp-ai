-- Borrador de onboarding por tenant + logo y fecha de complete

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TenantOnboardingDraft" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "currentStep"    INTEGER NOT NULL DEFAULT 1,
  "draftJson"      JSONB NOT NULL DEFAULT '{}',
  "draftUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantOnboardingDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantOnboardingDraft_tenantId_key"
  ON "TenantOnboardingDraft"("tenantId");

DO $$ BEGIN
  ALTER TABLE "TenantOnboardingDraft"
    ADD CONSTRAINT "TenantOnboardingDraft_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
