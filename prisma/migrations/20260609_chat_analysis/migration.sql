-- CreateEnum
CREATE TYPE "ChatImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatSenderRole" AS ENUM ('CUSTOMER', 'BUSINESS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FaqSuggestionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'EDITED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ToneAnalysisStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ChatImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "originalFilename" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "storagePath" TEXT,
    "businessSenderName" TEXT,
    "status" "ChatImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "customerMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "businessMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "detectedFaqCount" INTEGER NOT NULL DEFAULT 0,
    "detectedToneSummary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ChatImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "messageAt" TIMESTAMP(3),
    "senderLabel" TEXT,
    "senderRole" "ChatSenderRole" NOT NULL DEFAULT 'UNKNOWN',
    "content" TEXT,
    "contentAnonymized" TEXT,
    "isQuestion" BOOLEAN NOT NULL DEFAULT false,
    "isBusinessResponse" BOOLEAN NOT NULL DEFAULT false,
    "detectedIntent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedFaqSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importJobId" TEXT,
    "question" TEXT NOT NULL,
    "normalizedQuestion" TEXT,
    "suggestedAnswer" TEXT,
    "category" TEXT,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION,
    "status" "FaqSuggestionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectedFaqSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToneAnalysisResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importJobId" TEXT,
    "toneSummary" TEXT NOT NULL,
    "communicationStyle" TEXT,
    "commonPhrases" JSONB NOT NULL DEFAULT '[]',
    "emojiUsage" TEXT,
    "responseLength" TEXT,
    "salesStyle" TEXT,
    "formalityLevel" TEXT,
    "recommendedBotRules" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION,
    "status" "ToneAnalysisStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToneAnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatImportJob_tenantId_status_idx" ON "ChatImportJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ImportedChatMessage_importJobId_idx" ON "ImportedChatMessage"("importJobId");

-- CreateIndex
CREATE INDEX "ImportedChatMessage_tenantId_senderRole_idx" ON "ImportedChatMessage"("tenantId", "senderRole");

-- CreateIndex
CREATE INDEX "DetectedFaqSuggestion_tenantId_status_idx" ON "DetectedFaqSuggestion"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ToneAnalysisResult_tenantId_status_idx" ON "ToneAnalysisResult"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "ChatImportJob" ADD CONSTRAINT "ChatImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedChatMessage" ADD CONSTRAINT "ImportedChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedChatMessage" ADD CONSTRAINT "ImportedChatMessage_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ChatImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedFaqSuggestion" ADD CONSTRAINT "DetectedFaqSuggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedFaqSuggestion" ADD CONSTRAINT "DetectedFaqSuggestion_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ChatImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToneAnalysisResult" ADD CONSTRAINT "ToneAnalysisResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToneAnalysisResult" ADD CONSTRAINT "ToneAnalysisResult_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ChatImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
