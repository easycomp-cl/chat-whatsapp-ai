CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "TenantStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'PAUSED');
CREATE TYPE "ChannelType" AS ENUM ('EASYCOMP_ONBOARDING', 'WHATSAPP_BUSINESS');
CREATE TYPE "OnboardingStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'COMPLETED');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');
CREATE TYPE "ConversationMode" AS ENUM ('BOT', 'HUMAN');
CREATE TYPE "SenderType" AS ENUM ('CUSTOMER', 'BOT', 'ADMIN', 'SYSTEM');
CREATE TYPE "ContentType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'INTERACTIVE');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'WON', 'LOST');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');
CREATE TYPE "LinkStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "AdminSessionType" AS ENUM ('ADD_PRODUCT', 'ADD_SERVICE', 'ADD_FAQ', 'CHANGE_HOURS');
CREATE TYPE "AdminSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'ONBOARDING',
  "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "TenantChannel" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "channelType" "ChannelType" NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "wabaId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantChannel_phoneNumberId_key" ON "TenantChannel"("phoneNumberId");
CREATE UNIQUE INDEX "TenantChannel_tenantId_channelType_key" ON "TenantChannel"("tenantId","channelType");

CREATE TABLE "TenantAdmin" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'tenant_admin',
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantAdmin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantAdmin_tenantId_phoneNumber_key" ON "TenantAdmin"("tenantId","phoneNumber");

CREATE TABLE "OnboardingSession" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "adminPhone" TEXT NOT NULL,
  "currentStep" TEXT NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "collectedDataJson" JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OnboardingSession_tenantId_adminPhone_status_key" ON "OnboardingSession"("tenantId","adminPhone","status");

CREATE TABLE "OnboardingAnswer" (
  "id" TEXT PRIMARY KEY,
  "onboardingSessionId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "answerJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingAnswer_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "OnboardingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TenantConfig" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "botName" TEXT NOT NULL,
  "botTone" TEXT NOT NULL,
  "greetingMessage" TEXT NOT NULL,
  "fallbackMessage" TEXT NOT NULL,
  "handoffMessage" TEXT NOT NULL,
  "outOfHoursMessage" TEXT NOT NULL,
  "enableRag" BOOLEAN NOT NULL DEFAULT TRUE,
  "enableLeadCapture" BOOLEAN NOT NULL DEFAULT TRUE,
  "enableBooking" BOOLEAN NOT NULL DEFAULT FALSE,
  "enableQuotes" BOOLEAN NOT NULL DEFAULT FALSE,
  "enableSuggestions" BOOLEAN NOT NULL DEFAULT TRUE,
  "configJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantConfig_tenantId_key" ON "TenantConfig"("tenantId");

CREATE TABLE "TenantService" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "durationMinutes" INTEGER,
  "price" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'CLP',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantService_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TenantProduct" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'CLP',
  "imageUrl" TEXT,
  "stockOptional" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TenantFaq" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantFaq_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TenantDocument" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "fileUrl" TEXT,
  "fileType" TEXT NOT NULL,
  "contentText" TEXT,
  "status" TEXT NOT NULL,
  "indexedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "name" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "tagsJson" JSONB NOT NULL DEFAULT '[]',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Customer_tenantId_phoneNumber_key" ON "Customer"("tenantId","phoneNumber");

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channelPhoneNumber" TEXT NOT NULL,
  "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "mode" "ConversationMode" NOT NULL DEFAULT 'BOT',
  "assignedAdminId" TEXT,
  "currentIntent" TEXT,
  "summary" TEXT,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Conversation_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "TenantAdmin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "senderType" "SenderType" NOT NULL,
  "senderPhone" TEXT NOT NULL,
  "receiverPhone" TEXT NOT NULL,
  "contentText" TEXT NOT NULL,
  "contentType" "ContentType" NOT NULL DEFAULT 'TEXT',
  "externalId" TEXT,
  "rawPayloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Lead" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'whatsapp',
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Appointment" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "serviceId" TEXT,
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Quote" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount" DECIMAL(10,2),
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Sale" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sourceConversationId" TEXT,
  "totalAmount" DECIMAL(10,2),
  "status" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Sale_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AdminConversationLink" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "status" "LinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminConversationLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminConversationLink_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "TenantAdmin" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminConversationLink_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorRef" TEXT,
  "eventType" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AdminSession" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "type" "AdminSessionType" NOT NULL,
  "status" "AdminSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "TenantAdmin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
