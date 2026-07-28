export type ReplyContext = {
  externalMessageId: string;
  fromPhone?: string;
};

export type NormalizedIncomingMessage = {
  kind: "message";
  externalMessageId: string;
  fromPhone: string;
  fromName?: string;
  toPhoneNumberId: string;
  toPhoneDisplay?: string;
  text: string;
  timestamp: Date;
  replyContext?: ReplyContext;
  rawPayload: unknown;
};

export type NormalizedIncomingReaction = {
  kind: "reaction";
  externalMessageId: string;
  fromPhone: string;
  fromName?: string;
  toPhoneNumberId: string;
  toPhoneDisplay?: string;
  targetMessageId: string;
  emoji: string;
  timestamp: Date;
  rawPayload: unknown;
};

export type NormalizedIncomingEdit = {
  kind: "edit";
  externalMessageId: string;
  fromPhone: string;
  fromName?: string;
  toPhoneNumberId: string;
  toPhoneDisplay?: string;
  originalMessageId: string;
  text: string;
  timestamp: Date;
  rawPayload: unknown;
};

export type NormalizedIncomingRevoke = {
  kind: "revoke";
  externalMessageId: string;
  fromPhone: string;
  fromName?: string;
  toPhoneNumberId: string;
  toPhoneDisplay?: string;
  originalMessageId: string;
  timestamp: Date;
  rawPayload: unknown;
};

export type NormalizedMessageStatus = {
  kind: "status";
  externalMessageId: string;
  recipientPhone: string;
  toPhoneNumberId: string;
  toPhoneDisplay?: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  rawPayload: unknown;
};

export type NormalizedWebhookEvent =
  | NormalizedIncomingMessage
  | NormalizedIncomingReaction
  | NormalizedIncomingEdit
  | NormalizedIncomingRevoke
  | NormalizedMessageStatus;

export type OutboundMessage = {
  to: string;
  text: string;
  previewUrl?: boolean;
  replyToExternalId?: string;
};
