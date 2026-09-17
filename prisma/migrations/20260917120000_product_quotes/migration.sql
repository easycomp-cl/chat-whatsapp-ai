-- Cotizaciones de productos (preview/PDF/envío WhatsApp)

DO $$ BEGIN
  CREATE TYPE "ProductQuoteCreatedBy" AS ENUM ('HUMAN', 'BOT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProductQuoteStatus" AS ENUM ('ISSUED', 'SENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProductQuote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "quoteNumber" TEXT NOT NULL,
  "createdBy" "ProductQuoteCreatedBy" NOT NULL,
  "status" "ProductQuoteStatus" NOT NULL DEFAULT 'ISSUED',
  "customerNote" TEXT,
  "deliveryMethod" TEXT,
  "commune" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'CLP',
  "productsSubtotal" DOUBLE PRECISION NOT NULL,
  "deliveryPrice" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "linesJson" JSONB NOT NULL,
  "notesJson" JSONB NOT NULL DEFAULT '[]',
  "pdfStoragePath" TEXT,
  "messageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductQuote_tenantId_quoteNumber_key"
  ON "ProductQuote"("tenantId", "quoteNumber");

CREATE INDEX IF NOT EXISTS "ProductQuote_tenantId_createdAt_idx"
  ON "ProductQuote"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "ProductQuote_conversationId_createdAt_idx"
  ON "ProductQuote"("conversationId", "createdAt");

ALTER TABLE "ProductQuote"
  ADD CONSTRAINT "ProductQuote_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductQuote"
  ADD CONSTRAINT "ProductQuote_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
