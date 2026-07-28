-- Inbox list: preview por conversación + alineación Prisma chatClearedAt

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "chatClearedAt" TIMESTAMPTZ;

-- Acelera LATERAL "último mensaje por conversación"
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_desc_idx"
  ON "Message" ("conversationId", "createdAt" DESC);

-- Acelera listados recientes por tenant (fallback / analytics)
CREATE INDEX IF NOT EXISTS "Message_tenantId_createdAt_desc_idx"
  ON "Message" ("tenantId", "createdAt" DESC);
