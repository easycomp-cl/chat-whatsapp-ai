import { createHash } from "node:crypto";
import type { ChannelStatus } from "@prisma/client";
import { normalizePhone } from "../../utils/phone.js";
import type { WhatsAppPublicStatus } from "./whatsapp-connection.types.js";

export function hashAuthorizationCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function normalizeDisplayPhone(value: string): string {
  const normalized = normalizePhone(value);
  if (!normalized) return value.trim();
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export function mapChannelToPublicStatus(channel: {
  status: ChannelStatus;
  isActive: boolean;
  accessTokenEncrypted: string | null;
  lastError: string | null;
} | null): WhatsAppPublicStatus {
  if (!channel) return "pending";
  if (channel.lastError && (channel.status !== "ACTIVE" || !channel.isActive)) {
    return "error";
  }
  if (channel.status === "ACTIVE" && channel.isActive && channel.accessTokenEncrypted) {
    return "connected";
  }
  if (channel.lastError) return "error";
  return "pending";
}
