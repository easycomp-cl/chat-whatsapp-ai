import { ConversationStatus, MessageDirection, type Customer } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { GreetingWarmth } from "../chat-analysis/types/greeting-config.type.js";
import { parseToneGreetingConfig } from "../runtime/greeting-runtime.service.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export type CustomerReturningStats = {
  inbound_message_count: number;
  closed_conversation_count: number;
  is_returning: boolean;
};

export async function getCustomerReturningStats(input: {
  customer: Pick<Customer, "id" | "tenantId" | "profileMetadata">;
  tenantConfigJson?: unknown;
}): Promise<CustomerReturningStats> {
  const greetingConfig = parseToneGreetingConfig(input.tenantConfigJson);
  const metadata = asRecord(input.customer.profileMetadata);
  if (metadata.manual_returning === true) {
    return {
      inbound_message_count: 0,
      closed_conversation_count: 0,
      is_returning: true
    };
  }

  const [inboundMessageCount, closedConversationCount] = await Promise.all([
    prisma.message.count({
      where: {
        customerId: input.customer.id,
        tenantId: input.customer.tenantId,
        direction: MessageDirection.INBOUND
      }
    }),
    prisma.conversation.count({
      where: {
        customerId: input.customer.id,
        tenantId: input.customer.tenantId,
        status: ConversationStatus.CLOSED
      }
    })
  ]);

  const isReturning =
    inboundMessageCount >= greetingConfig.returning_min_messages || closedConversationCount >= 1;

  return {
    inbound_message_count: inboundMessageCount,
    closed_conversation_count: closedConversationCount,
    is_returning: isReturning
  };
}

export async function resolveCustomerWarmthForMessage(input: {
  customerId: string;
  tenantId: string;
  tenantConfigJson?: unknown;
}): Promise<GreetingWarmth> {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, tenantId: true, profileMetadata: true }
  });
  if (!customer) {
    return parseToneGreetingConfig(input.tenantConfigJson).new_customer_warmth;
  }

  const config = parseToneGreetingConfig(input.tenantConfigJson);
  const stats = await getCustomerReturningStats({
    customer,
    tenantConfigJson: input.tenantConfigJson
  });
  return stats.is_returning ? config.returning_customer_warmth : config.new_customer_warmth;
}

export async function resolvePriorInboundCountForWarmth(input: {
  customerId: string;
  tenantId: string;
  tenantConfigJson?: unknown;
}): Promise<number> {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, tenantId: true, profileMetadata: true }
  });
  if (!customer) {
    return 0;
  }

  const stats = await getCustomerReturningStats({
    customer,
    tenantConfigJson: input.tenantConfigJson
  });

  if (stats.is_returning) {
    const greetingConfig = parseToneGreetingConfig(input.tenantConfigJson);
    return Math.max(stats.inbound_message_count, greetingConfig.returning_min_messages);
  }

  return stats.inbound_message_count;
}
