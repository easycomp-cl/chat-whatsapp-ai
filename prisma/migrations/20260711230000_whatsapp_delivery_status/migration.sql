-- Estado de entrega WhatsApp para mensajes outbound (UI: pendiente / enviado / fallido).

CREATE TYPE "WhatsappDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "whatsappDeliveryStatus" "WhatsappDeliveryStatus";

UPDATE "Message"
SET "whatsappDeliveryStatus" = 'SENT'
WHERE direction = 'OUTBOUND' AND "externalId" IS NOT NULL;

UPDATE "Message"
SET "whatsappDeliveryStatus" = 'FAILED'
WHERE direction = 'OUTBOUND' AND "externalId" IS NULL;
