import { WhatsappDeliveryStatus } from "@prisma/client";

const STATUS_RANK: Record<WhatsappDeliveryStatus, number> = {
  [WhatsappDeliveryStatus.PENDING]: 0,
  [WhatsappDeliveryStatus.FAILED]: -1,
  [WhatsappDeliveryStatus.SENT]: 1,
  [WhatsappDeliveryStatus.DELIVERED]: 2,
  [WhatsappDeliveryStatus.READ]: 3
};

export function mapMetaStatusToWhatsappDeliveryStatus(
  status: string
): WhatsappDeliveryStatus | null {
  switch (status.toLowerCase()) {
    case "sent":
      return WhatsappDeliveryStatus.SENT;
    case "delivered":
      return WhatsappDeliveryStatus.DELIVERED;
    case "read":
      return WhatsappDeliveryStatus.READ;
    case "failed":
      return WhatsappDeliveryStatus.FAILED;
    default:
      return null;
  }
}

export function shouldUpgradeWhatsappDeliveryStatus(
  current: WhatsappDeliveryStatus | null | undefined,
  next: WhatsappDeliveryStatus
): boolean {
  if (!current) return true;
  // Graph suele devolver wamid (SENT) y recién después el webhook `failed`
  // (pago, moneda, 24 h, etc.). Si no aplicamos FAILED sobre SENT, el panel
  // queda en “enviado” y el contacto nunca recibe el mensaje.
  if (next === WhatsappDeliveryStatus.FAILED) {
    return (
      current === WhatsappDeliveryStatus.PENDING ||
      current === WhatsappDeliveryStatus.SENT
    );
  }
  if (current === WhatsappDeliveryStatus.FAILED) {
    return false;
  }
  return STATUS_RANK[next] > STATUS_RANK[current];
}
