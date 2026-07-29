import type { ContentType, Message, SenderType, WhatsappDeliveryStatus } from "@prisma/client";

export type SerializedMessageMedia = {
  has_media: boolean;
  mime_type: string | null;
  filename: string | null;
  file_size: number | null;
  media_url_path: string | null;
};

export type SerializedMessage = {
  id: string;
  conversationId: string;
  tenantId: string;
  customerId: string | null;
  direction: string;
  senderType: SenderType;
  senderPhone: string;
  receiverPhone: string;
  content_text: string;
  content_type: ContentType;
  contentTextSnapshot: string | null;
  customerEditedAt: Date | null;
  customerRevokedAt: Date | null;
  external_id: string | null;
  whatsapp_delivery_status: WhatsappDeliveryStatus | null;
  aiGenerated: boolean;
  reply_to_message_id: string | null;
  quoted_text: string | null;
  quoted_sender_type: SenderType | null;
  replyToExternalId: string | null;
  created_at: Date;
  media: SerializedMessageMedia;
};

export function serializeMessage(message: Message): SerializedMessage {
  const hasMedia = Boolean(message.mediaStoragePath && message.mediaStorageBucket);

  return {
    id: message.id,
    conversationId: message.conversationId,
    tenantId: message.tenantId,
    customerId: message.customerId,
    direction: message.direction,
    senderType: message.senderType,
    senderPhone: message.senderPhone,
    receiverPhone: message.receiverPhone,
    content_text: message.contentText,
    content_type: message.contentType,
    contentTextSnapshot: message.contentTextSnapshot,
    customerEditedAt: message.customerEditedAt,
    customerRevokedAt: message.customerRevokedAt,
    external_id: message.externalId,
    whatsapp_delivery_status: message.whatsappDeliveryStatus,
    aiGenerated: message.aiGenerated,
    reply_to_message_id: message.replyToMessageId,
    quoted_text: message.quotedText,
    quoted_sender_type: message.quotedSenderType,
    replyToExternalId: message.replyToExternalId,
    created_at: message.createdAt,
    media: {
      has_media: hasMedia,
      mime_type: message.mediaMimeType,
      filename: message.mediaFilename,
      file_size: message.mediaFileSize,
      media_url_path: hasMedia ? `/messages/${message.id}/media-url` : null
    }
  };
}
