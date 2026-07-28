-- Performance indexes for tenant-scoped queries and metrics
CREATE INDEX IF NOT EXISTS "TenantFaq_tenantId_idx" ON "TenantFaq"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantDocument_tenantId_idx" ON "TenantDocument"("tenantId");
CREATE INDEX IF NOT EXISTS "Conversation_tenantId_lastMessageAt_idx" ON "Conversation"("tenantId", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_tenantId_direction_senderType_createdAt_idx" ON "Message"("tenantId", "direction", "senderType", "createdAt");
