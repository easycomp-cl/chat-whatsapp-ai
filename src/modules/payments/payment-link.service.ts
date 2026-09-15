import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { readPaymentDestinationUrl, slugifyPaymentCode } from "./payment-link.utils.js";

export type PublicPaymentLink = {
  ok: true;
  found: boolean;
  code: string;
  order_ref: string;
  business_name: string | null;
  destination_url: string | null;
};

export class PaymentLinkService {
  async ensureForTemplateSend(input: {
    tenantId: string;
    conversationId: string;
    requestedCode?: string;
    orderRef?: string;
  }): Promise<{ code: string; orderRef: string }> {
    const requested = slugifyPaymentCode(
      input.requestedCode?.trim() || input.orderRef?.trim() || `pedido-${Date.now()}`
    );
    const code = await this.allocateCode(input.tenantId, requested);
    const orderRef = input.orderRef?.trim() || code;

    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
      include: { config: true }
    });
    const destinationUrl = readPaymentDestinationUrl(tenant?.config?.configJson ?? null);

    await prisma.paymentLink.upsert({
      where: { code },
      create: {
        tenantId: input.tenantId,
        code,
        orderRef,
        conversationId: input.conversationId,
        ...(destinationUrl ? { destinationUrl } : {})
      },
      update: {
        orderRef,
        conversationId: input.conversationId,
        ...(destinationUrl ? { destinationUrl } : {})
      }
    });

    return { code, orderRef };
  }

  async getPublicByCode(code: string): Promise<PublicPaymentLink> {
    const normalized = slugifyPaymentCode(code);
    const row = await prisma.paymentLink.findUnique({
      where: { code: normalized },
      include: { tenant: { select: { name: true } } }
    });

    if (!row) {
      return {
        ok: true,
        found: false,
        code: normalized,
        order_ref: code.trim() || normalized,
        business_name: null,
        destination_url: null
      };
    }

    return {
      ok: true,
      found: true,
      code: row.code,
      order_ref: row.orderRef,
      business_name: row.tenant.name,
      destination_url: row.destinationUrl
    };
  }

  private async allocateCode(tenantId: string, requested: string): Promise<string> {
    const existing = await prisma.paymentLink.findUnique({ where: { code: requested } });
    if (!existing || existing.tenantId === tenantId) {
      return requested;
    }
    return slugifyPaymentCode(`${requested}-${randomBytes(3).toString("hex")}`);
  }
}

export const paymentLinkService = new PaymentLinkService();
