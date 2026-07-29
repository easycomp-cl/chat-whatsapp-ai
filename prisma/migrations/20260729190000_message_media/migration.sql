-- Media adjunto en mensajes de conversación (imágenes, PDFs, documentos WA)
ALTER TABLE "Message" ADD COLUMN "mediaStorageBucket" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaStoragePath" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaMimeType" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaFilename" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaFileSize" INTEGER;
ALTER TABLE "Message" ADD COLUMN "whatsappMediaId" TEXT;

CREATE INDEX "Message_mediaStoragePath_idx" ON "Message"("mediaStoragePath");
