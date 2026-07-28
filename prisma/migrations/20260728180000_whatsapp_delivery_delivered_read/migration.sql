-- Estados de entrega alineados con webhooks de Meta: sent → delivered → read

ALTER TYPE "WhatsappDeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "WhatsappDeliveryStatus" ADD VALUE IF NOT EXISTS 'READ';
