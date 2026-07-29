import { prisma } from "../../lib/prisma.js";
import { resolveCustomerDisplayName } from "../../utils/customer-display-name.js";

type InboxRow = {
  id: string;
  business_id: string;
  customer_id: string;
  channel: string;
  channel_phone_number: string;
  status: string;
  mode: string;
  assigned_admin_id: string | null;
  handoff_reason: string | null;
  bot_resume_at: Date | null;
  last_message_at: Date | null;
  chat_cleared_at: Date | null;
  created_at: Date;
  updated_at: Date;
  customer_phone_number: string;
  customer_name: string | null;
  customer_display_alias: string | null;
  customer_first_seen_at: Date | null;
  customer_last_seen_at: Date | null;
  last_message_preview: string | null;
};

export type InboxConversation = {
  id: string;
  business_id: string;
  customer_id: string;
  channel: string;
  channel_phone_number: string;
  status: string;
  mode: string;
  assigned_admin_id: string | null;
  handoff_reason: string | null;
  bot_resume_at: string | null;
  last_message_at: string | null;
  chat_cleared_at: string | null;
  created_at: string;
  updated_at: string;
  customers: {
    id: string;
    business_id: string;
    phone_number: string;
    name: string | null;
    display_alias: string | null;
    display_name: string;
    first_seen_at: string | null;
    last_seen_at: string | null;
  } | null;
  last_message_preview: string | null;
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapRow(row: InboxRow): InboxConversation {
  return {
    id: row.id,
    business_id: row.business_id,
    customer_id: row.customer_id,
    channel: row.channel,
    channel_phone_number: row.channel_phone_number,
    status: row.status,
    mode: row.mode,
    assigned_admin_id: row.assigned_admin_id,
    handoff_reason: row.handoff_reason,
    bot_resume_at: toIso(row.bot_resume_at),
    last_message_at: toIso(row.last_message_at),
    chat_cleared_at: toIso(row.chat_cleared_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    customers: {
      id: row.customer_id,
      business_id: row.business_id,
      phone_number: row.customer_phone_number,
      name: row.customer_name,
      display_alias: row.customer_display_alias,
      display_name: resolveCustomerDisplayName({
        displayAlias: row.customer_display_alias,
        name: row.customer_name,
        phoneNumber: row.customer_phone_number
      }),
      first_seen_at: toIso(row.customer_first_seen_at),
      last_seen_at: toIso(row.customer_last_seen_at)
    },
    last_message_preview: row.last_message_preview
  };
}

export class ConversationsInboxService {
  /**
   * Una sola query: conversaciones + cliente + preview del último mensaje visible.
   * Reemplaza 3 round-trips Supabase en la UI.
   */
  async listInbox(input: {
    tenantId: string;
    assignedAdminId?: string | null;
    limit?: number;
  }): Promise<InboxConversation[]> {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
    const assignedAdminId = input.assignedAdminId ?? null;

    const rows = await prisma.$queryRaw<InboxRow[]>`
      SELECT
        c.id,
        c."tenantId" AS business_id,
        c."customerId" AS customer_id,
        c.channel::text AS channel,
        c."channelPhoneNumber" AS channel_phone_number,
        c.status::text AS status,
        c.mode::text AS mode,
        c."assignedAdminId" AS assigned_admin_id,
        c."handoffReason" AS handoff_reason,
        c."botResumeAt" AS bot_resume_at,
        c."lastMessageAt" AS last_message_at,
        c."chatClearedAt" AS chat_cleared_at,
        c."createdAt" AS created_at,
        c."updatedAt" AS updated_at,
        cu."phoneNumber" AS customer_phone_number,
        cu.name AS customer_name,
        cu."displayAlias" AS customer_display_alias,
        cu."firstSeenAt" AS customer_first_seen_at,
        cu."lastSeenAt" AS customer_last_seen_at,
        preview."contentText" AS last_message_preview
      FROM "Conversation" c
      INNER JOIN "Customer" cu ON cu.id = c."customerId"
      LEFT JOIN LATERAL (
        SELECT m."contentText"
        FROM "Message" m
        WHERE m."conversationId" = c.id
          AND (
            c."chatClearedAt" IS NULL
            OR m."createdAt" > c."chatClearedAt"
          )
        ORDER BY m."createdAt" DESC
        LIMIT 1
      ) preview ON true
      WHERE c."tenantId" = ${input.tenantId}
        AND (${assignedAdminId}::text IS NULL OR c."assignedAdminId" = ${assignedAdminId})
      ORDER BY c."lastMessageAt" DESC NULLS LAST
      LIMIT ${limit}
    `;

    return rows.map(mapRow);
  }
}

export const conversationsInboxService = new ConversationsInboxService();
