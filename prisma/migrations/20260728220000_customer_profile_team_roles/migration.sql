-- Customer CRM profile + team member role default

DO $$ BEGIN
  CREATE TYPE "CustomerInvoiceType" AS ENUM ('RECEIPT', 'INVOICE', 'NONE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BillingSameAsDelivery" AS ENUM ('NONE', 'DELIVERY_1', 'DELIVERY_2');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "displayAlias" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "taxId" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceType" "CustomerInvoiceType",
  ADD COLUMN IF NOT EXISTS "companyName" TEXT,
  ADD COLUMN IF NOT EXISTS "businessActivity" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery1Line1" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery1Line2" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery1Commune" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery1Region" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery1Notes" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery2Line1" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery2Line2" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery2Commune" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery2Region" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery2Notes" TEXT,
  ADD COLUMN IF NOT EXISTS "billingLine1" TEXT,
  ADD COLUMN IF NOT EXISTS "billingLine2" TEXT,
  ADD COLUMN IF NOT EXISTS "billingCommune" TEXT,
  ADD COLUMN IF NOT EXISTS "billingRegion" TEXT,
  ADD COLUMN IF NOT EXISTS "billingNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "billingSameAsDelivery" "BillingSameAsDelivery",
  ADD COLUMN IF NOT EXISTS "profileMetadata" JSONB,
  ADD COLUMN IF NOT EXISTS "profileUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "profileUpdatedBy" TEXT;

UPDATE "TenantAdmin" SET role = 'collaborator' WHERE role = 'agent';
ALTER TABLE "TenantAdmin" ALTER COLUMN role SET DEFAULT 'collaborator';

-- Vista Supabase (misma BD que usa el dashboard).
-- DROP + CREATE: CREATE OR REPLACE no puede insertar columnas en el medio.
DROP VIEW IF EXISTS public.customers;
CREATE VIEW public.customers
WITH (security_invoker = true) AS
SELECT
  id,
  "tenantId" AS business_id,
  "phoneNumber" AS phone_number,
  name,
  "displayAlias" AS display_alias,
  email,
  "taxId" AS tax_id,
  "invoiceType"::text AS invoice_type,
  "companyName" AS company_name,
  "businessActivity" AS business_activity,
  "delivery1Line1" AS delivery1_line1,
  "delivery1Line2" AS delivery1_line2,
  "delivery1Commune" AS delivery1_commune,
  "delivery1Region" AS delivery1_region,
  "delivery1Notes" AS delivery1_notes,
  "delivery2Line1" AS delivery2_line1,
  "delivery2Line2" AS delivery2_line2,
  "delivery2Commune" AS delivery2_commune,
  "delivery2Region" AS delivery2_region,
  "delivery2Notes" AS delivery2_notes,
  "billingLine1" AS billing_line1,
  "billingLine2" AS billing_line2,
  "billingCommune" AS billing_commune,
  "billingRegion" AS billing_region,
  "billingNotes" AS billing_notes,
  "billingSameAsDelivery"::text AS billing_same_as_delivery,
  "profileMetadata" AS profile_metadata,
  "profileUpdatedAt" AS profile_updated_at,
  "profileUpdatedBy" AS profile_updated_by,
  "firstSeenAt" AS first_seen_at,
  "lastSeenAt" AS last_seen_at
FROM public."Customer";
