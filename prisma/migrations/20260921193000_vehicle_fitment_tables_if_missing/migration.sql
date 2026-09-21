-- Re-aplicar tablas de vehículos si la migración 20260921180000 quedó marcada
-- sin crear objetos (P2021 VehiclePlateLookup tumba el API).

ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'SYSTEM_EVENT';

CREATE TABLE IF NOT EXISTS "VehicleMake" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "aliases" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleMake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleMake_slug_key" ON "VehicleMake"("slug");

CREATE TABLE IF NOT EXISTS "VehicleModel" (
  "id" TEXT NOT NULL,
  "makeId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "yearFrom" INTEGER NOT NULL,
  "yearTo" INTEGER,
  "engine" TEXT,
  "aliases" JSONB NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleModel_makeId_slug_yearFrom_key"
  ON "VehicleModel"("makeId", "slug", "yearFrom");
CREATE INDEX IF NOT EXISTS "VehicleModel_slug_idx" ON "VehicleModel"("slug");
CREATE INDEX IF NOT EXISTS "VehicleModel_makeId_slug_idx" ON "VehicleModel"("makeId", "slug");

CREATE TABLE IF NOT EXISTS "VehicleFitment" (
  "id" TEXT NOT NULL,
  "vehicleModelId" TEXT NOT NULL,
  "partType" TEXT NOT NULL,
  "skuHint" TEXT,
  "spec" TEXT,
  "notes" TEXT,
  "confidence" TEXT NOT NULL DEFAULT 'beta',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleFitment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleFitment_vehicleModelId_partType_key"
  ON "VehicleFitment"("vehicleModelId", "partType");
CREATE INDEX IF NOT EXISTS "VehicleFitment_partType_idx" ON "VehicleFitment"("partType");

CREATE TABLE IF NOT EXISTS "CatalogProductFitment" (
  "id" TEXT NOT NULL,
  "tenantCatalogProductId" TEXT NOT NULL,
  "vehicleModelId" TEXT,
  "partType" TEXT NOT NULL,
  "isUniversal" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogProductFitment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CatalogProductFitment_tenantCatalogProductId_idx"
  ON "CatalogProductFitment"("tenantCatalogProductId");
CREATE INDEX IF NOT EXISTS "CatalogProductFitment_vehicleModelId_idx"
  ON "CatalogProductFitment"("vehicleModelId");
CREATE INDEX IF NOT EXISTS "CatalogProductFitment_partType_idx"
  ON "CatalogProductFitment"("partType");

CREATE TABLE IF NOT EXISTS "VehiclePlateLookup" (
  "id" TEXT NOT NULL,
  "plateNormalized" TEXT NOT NULL,
  "makeName" TEXT,
  "modelName" TEXT,
  "year" INTEGER,
  "engine" TEXT,
  "vehicleType" TEXT,
  "color" TEXT,
  "vehicleModelId" TEXT,
  "provider" TEXT NOT NULL,
  "rawJson" JSONB,
  "lookedUpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehiclePlateLookup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehiclePlateLookup_plateNormalized_key"
  ON "VehiclePlateLookup"("plateNormalized");
CREATE INDEX IF NOT EXISTS "VehiclePlateLookup_expiresAt_idx" ON "VehiclePlateLookup"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "VehicleModel"
    ADD CONSTRAINT "VehicleModel_makeId_fkey"
    FOREIGN KEY ("makeId") REFERENCES "VehicleMake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VehicleFitment"
    ADD CONSTRAINT "VehicleFitment_vehicleModelId_fkey"
    FOREIGN KEY ("vehicleModelId") REFERENCES "VehicleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CatalogProductFitment"
    ADD CONSTRAINT "CatalogProductFitment_tenantCatalogProductId_fkey"
    FOREIGN KEY ("tenantCatalogProductId") REFERENCES "TenantCatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CatalogProductFitment"
    ADD CONSTRAINT "CatalogProductFitment_vehicleModelId_fkey"
    FOREIGN KEY ("vehicleModelId") REFERENCES "VehicleModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
