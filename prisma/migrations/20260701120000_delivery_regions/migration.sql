-- Delivery regions and communes for bot + dashboard

CREATE TABLE IF NOT EXISTS public."TenantDeliveryRegion" (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  courier TEXT NOT NULL,
  "defaultPrice" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", name)
);

CREATE INDEX IF NOT EXISTS "TenantDeliveryRegion_tenantId_isActive_idx"
  ON public."TenantDeliveryRegion" ("tenantId", "isActive");

CREATE TABLE IF NOT EXISTS public."TenantDeliveryCommune" (
  id TEXT PRIMARY KEY,
  "regionId" TEXT NOT NULL REFERENCES public."TenantDeliveryRegion"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "priceOverride" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("regionId", name)
);

CREATE INDEX IF NOT EXISTS "TenantDeliveryCommune_regionId_isActive_idx"
  ON public."TenantDeliveryCommune" ("regionId", "isActive");
