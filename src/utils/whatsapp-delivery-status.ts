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
  if (next === WhatsappDeliveryStatus.FAILED) {
    return current === WhatsappDeliveryStatus.PENDING;
  }
  if (current === WhatsappDeliveryStatus.FAILED) {
    return false;
  }
  return STATUS_RANK[next] > STATUS_RANK[current];
}
