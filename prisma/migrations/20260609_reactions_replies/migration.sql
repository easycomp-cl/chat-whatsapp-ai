-- Reply / quote fields on Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "quotedText" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "quotedSenderType" "SenderType";
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyToExternalId" TEXT;

CREATE INDEX IF NOT EXISTS "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");
CREATE INDEX IF NOT EXISTS "Message_externalId_idx" ON "Message"("externalId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Message_replyToMessageId_fkey'
  ) THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_replyToMessageId_fkey"
      FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- MessageReaction table
CREATE TABLE IF NOT EXISTS "MessageReaction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "senderType" "SenderType" NOT NULL,
  "senderPhone" TEXT,
  "externalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_externalId_key"
  ON "MessageReaction"("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_messageId_senderPhone_key"
  ON "MessageReaction"("messageId", "senderPhone");
CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
CREATE INDEX IF NOT EXISTS "MessageReaction_conversationId_idx" ON "MessageReaction"("conversationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_tenantId_fkey') THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_conversationId_fkey') THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_messageId_fkey') THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
