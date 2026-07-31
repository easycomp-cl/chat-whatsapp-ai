-- Detalle de error cuando Meta reporta status failed en mensajes salientes
ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "whatsappDeliveryErrorCode" INTEGER,
  ADD COLUMN IF NOT EXISTS "whatsappDeliveryErrorMessage" TEXT;
