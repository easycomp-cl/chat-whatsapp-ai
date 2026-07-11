-- AlterEnum
ALTER TYPE "KnowledgeDocumentStatus" ADD VALUE IF NOT EXISTS 'INDEXING';

-- CreateEnum
CREATE TYPE "CatalogProductSource" AS ENUM ('MANUAL', 'CSV', 'JSON', 'SHOPIFY');
CREATE TYPE "IntegrationProvider" AS ENUM ('SHOPIFY');

-- AlterTable TenantFaq
ALTER TABLE "TenantFaq" ADD COLUMN IF NOT EXISTS "alternatePhrases" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TenantFaq" ADD COLUMN IF NOT EXISTS "keywords" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TenantFaq" ADD COLUMN IF NOT EXISTS "searchText" TEXT;

-- AlterTable TenantDocument
ALTER TABLE "TenantDocument" ADD COLUMN IF NOT EXISTS "storagePath" TEXT;
ALTER TABLE "TenantDocument" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "TenantDocument" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
ALTER TABLE "TenantDocument" ADD COLUMN IF NOT EXISTS "indexError" TEXT;

-- CreateTable TenantCatalogProduct
CREATE TABLE "TenantCatalogProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "category" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "source" "CatalogProductSource" NOT NULL DEFAULT 'MANUAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantCatalogProduct_tenantId_isActive_idx" ON "TenantCatalogProduct"("tenantId", "isActive");
CREATE UNIQUE INDEX "TenantCatalogProduct_tenantId_externalId_key" ON "TenantCatalogProduct"("tenantId", "externalId");

ALTER TABLE "TenantCatalogProduct" ADD CONSTRAINT "TenantCatalogProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable TenantIntegration
CREATE TABLE "TenantIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "shopDomain" TEXT,
    "credentialsEncrypted" TEXT,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantIntegration_tenantId_provider_key" ON "TenantIntegration"("tenantId", "provider");

ALTER TABLE "TenantIntegration" ADD CONSTRAINT "TenantIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
