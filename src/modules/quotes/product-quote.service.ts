import { ContentType, Prisma, ProductQuoteCreatedBy, ProductQuoteStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { TenantResolverService } from "../tenants/tenant-resolver.service.js";
import { MessageIngestService } from "../conversations/message-ingest.service.js";
import { messageMediaService } from "../conversations/message-media.service.js";
import { matchDeliveryCommune } from "../flows/flow-quote.service.js";
import { WhatsAppSendError } from "../channel/whatsapp.client.js";
import { parseGraphApiErrorBody } from "../../utils/whatsapp-delivery-error.js";
import { resolveCustomerDisplayName } from "../../utils/customer-display-name.js";
import { ProductQuoteHttpError } from "./product-quote.errors.js";
import type { ProductQuoteRequestInput } from "./product-quote.schema.js";
import {
  DEFAULT_QUOTE_NOTES,
  type ProductQuoteDeliveryMethod,
  type ProductQuoteLineView,
  type ProductQuotePreview
} from "./product-quote.types.js";
import {
  buildDeliveryView,
  defaultQuoteCaption,
  extractDeliveryFromText,
  isProductQuoteRequest,
  nextQuoteNumber,
  quotePdfFilename
} from "./product-quote.utils.js";
import { matchCatalogProductsFromText } from "./product-quote-match.js";
import { buildProductQuotePdf } from "./product-quote-pdf.js";
import { customerProductHistoryService } from "../customers/customer-product-history.service.js";

type QuoteConversation = {
  id: string;
  tenantId: string;
  customerId: string;
  channelPhoneNumber: string;
  tenant: { id: string; name: string };
  customer: {
    name: string | null;
    displayAlias: string | null;
    phoneNumber: string;
  };
};

export class ProductQuoteService {
  constructor(
    private readonly tenantResolver = new TenantResolverService(),
    private readonly messageIngest = new MessageIngestService()
  ) {}

  async preview(
    conversationId: string,
    input: ProductQuoteRequestInput
  ): Promise<ProductQuotePreview> {
    const conversation = await this.loadConversation(conversationId);
    return this.buildPreview(conversation, input, "BORRADOR");
  }

  async issuePdf(
    conversationId: string,
    input: ProductQuoteRequestInput,
    createdBy: ProductQuoteCreatedBy
  ): Promise<{ preview: ProductQuotePreview; buffer: Buffer; filename: string; quoteId: string }> {
    const conversation = await this.loadConversation(conversationId);
    let quoteNumber = await this.allocateQuoteNumber(conversation.tenantId);
    const preview = await this.buildPreview(conversation, input, quoteNumber);
    let buffer = await buildProductQuotePdf(preview);
    let persistedPreview = preview;

    let quote;
    try {
      quote = await prisma.productQuote.create({
        data: this.toQuoteCreateData(conversation, persistedPreview, createdBy)
      });
    } catch (error) {
      if (!isUniqueQuoteNumberError(error)) {
        throw error;
      }
      quoteNumber = await this.allocateQuoteNumber(conversation.tenantId);
      persistedPreview = { ...preview, quote_number: quoteNumber };
      buffer = await buildProductQuotePdf(persistedPreview);
      quote = await prisma.productQuote.create({
        data: this.toQuoteCreateData(conversation, persistedPreview, createdBy)
      });
    }

    return {
      preview: persistedPreview,
      buffer,
      filename: quotePdfFilename(quoteNumber),
      quoteId: quote.id
    };
  }

  async send(
    conversationId: string,
    input: ProductQuoteRequestInput,
    createdBy: ProductQuoteCreatedBy = ProductQuoteCreatedBy.BOT
  ) {
    const issued = await this.issuePdf(conversationId, input, createdBy);
    const channel = await this.loadActiveChannel(issued.preview, conversationId);
    const conversation = await this.loadConversation(conversationId);
    const caption =
      input.caption?.trim() ||
      defaultQuoteCaption({
        customerName: issued.preview.customer_name,
        quoteNumber: issued.preview.quote_number,
        total: issued.preview.total
      });

    const message = await this.messageIngest.ingestBotMessage({
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      botPhone: conversation.channelPhoneNumber,
      customerPhone: conversation.customer.phoneNumber,
      text: caption,
      contentType: ContentType.DOCUMENT,
      aiGenerated: false
    });

    try {
      await messageMediaService.storeOutboundBuffer({
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        messageId: message.id,
        buffer: issued.buffer,
        mimeType: "application/pdf",
        filename: issued.filename,
        contentType: ContentType.DOCUMENT
      });

      const accessToken = this.tenantResolver.resolveAccessToken(channel.accessTokenEncrypted);
      const wamid = await messageMediaService.sendStoredMessageToWhatsApp({
        messageId: message.id,
        phoneNumberId: channel.phoneNumberId,
        accessToken,
        to: conversation.customer.phoneNumber
      });
      if (wamid) {
        await this.messageIngest.setMessageExternalId(message.id, wamid);
      }
    } catch (error) {
      const deliveryError =
        error instanceof WhatsAppSendError ? parseGraphApiErrorBody(error.body) : undefined;
      await this.messageIngest.markDeliveryFailed(message.id, deliveryError);
      throw error;
    }

    const stored = await prisma.message.findUnique({ where: { id: message.id } });
    await prisma.productQuote.update({
      where: { id: issued.quoteId },
      data: {
        status: ProductQuoteStatus.SENT,
        messageId: message.id,
        pdfStoragePath: stored?.mediaStoragePath ?? null
      }
    });

    try {
      await customerProductHistoryService.recordQuoted({
        tenantId: conversation.tenantId,
        customerId: conversation.customerId,
        lines: issued.preview.lines.map((line) => ({
          product_id: line.product_id,
          sku: line.sku,
          name: line.name,
          quantity: line.quantity
        }))
      });
    } catch {
      // La cotización ya se envió; el historial del contacto no debe abortar el PDF.
    }

    return {
      preview: issued.preview,
      message: stored!,
      filename: issued.filename
    };
  }

  async trySendFromConversationText(input: {
    conversationId: string;
    incomingText: string;
    createdBy?: ProductQuoteCreatedBy;
    requireQuoteIntent?: boolean;
    deliveryMethod?: ProductQuoteDeliveryMethod;
    commune?: string | null;
    customerNote?: string | null;
  }): Promise<{ sent: boolean; preview?: ProductQuotePreview; messageId?: string }> {
    if (input.requireQuoteIntent !== false && !isProductQuoteRequest(input.incomingText)) {
      return { sent: false };
    }

    const conversation = await this.loadConversation(input.conversationId);
    const history = await this.recentCustomerAndBotText(input.conversationId);
    const searchText = `${history}\n${input.incomingText}`;
    const products = await prisma.tenantCatalogProduct.findMany({
      where: { tenantId: conversation.tenantId, isActive: true }
    });
    const matched = matchCatalogProductsFromText(searchText, products);
    if (matched.length === 0) {
      return { sent: false };
    }

    const inferred = extractDeliveryFromText(searchText);
    const request: ProductQuoteRequestInput = {
      lines: matched.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
      delivery_method: input.deliveryMethod ?? inferred.method,
      ...(input.commune ?? inferred.commune
        ? { commune: input.commune ?? inferred.commune ?? undefined }
        : {}),
      ...(input.customerNote
        ? { customer_note: input.customerNote }
        : looksLikeVehicleNote(input.incomingText)
          ? { customer_note: input.incomingText.slice(0, 280) }
          : {})
    };

    const result = await this.send(
      input.conversationId,
      request,
      input.createdBy ?? ProductQuoteCreatedBy.BOT
    );
    return {
      sent: true,
      preview: result.preview,
      messageId: result.message.id
    };
  }

  private async buildPreview(
    conversation: QuoteConversation,
    input: ProductQuoteRequestInput,
    quoteNumber: string
  ): Promise<ProductQuotePreview> {
    const method: ProductQuoteDeliveryMethod = input.delivery_method ?? "none";
    const productIds = [...new Set(input.lines.map((line) => line.product_id))];
    const products = await prisma.tenantCatalogProduct.findMany({
      where: {
        tenantId: conversation.tenantId,
        id: { in: productIds }
      }
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const lines: ProductQuoteLineView[] = [];
    for (const line of input.lines) {
      const product = byId.get(line.product_id);
      if (!product || !product.isActive) {
        throw new ProductQuoteHttpError("Producto no encontrado o inactivo", 400, "product_not_found");
      }
      if (product.price == null || product.price <= 0) {
        throw new ProductQuoteHttpError(
          `El producto ${product.sku ?? product.name} no tiene precio`,
          400,
          "product_without_price"
        );
      }
      const unitPrice = Math.round(product.price);
      lines.push({
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        quantity: line.quantity,
        unit_price: unitPrice,
        line_total: unitPrice * line.quantity
      });
    }

    const productsSubtotal = lines.reduce((sum, line) => sum + line.line_total, 0);
    const delivery = await this.resolveDelivery(conversation.tenantId, method, input.commune ?? null);
    const notes = [...DEFAULT_QUOTE_NOTES];
    if (method === "delivery" && !delivery.confirmed) {
      notes.unshift("Flete a confirmar: indica la comuna para calcular el despacho.");
    }

    return {
      quote_number: quoteNumber,
      business_name: conversation.tenant.name,
      customer_name: resolveCustomerDisplayName(conversation.customer),
      customer_phone: conversation.customer.phoneNumber,
      currency: "CLP",
      customer_note: input.customer_note?.trim() || null,
      delivery,
      lines,
      products_subtotal: productsSubtotal,
      delivery_price: delivery.price,
      total: productsSubtotal + delivery.price,
      notes,
      issued_at: new Date().toISOString()
    };
  }

  private async resolveDelivery(
    tenantId: string,
    method: ProductQuoteDeliveryMethod,
    commune: string | null
  ) {
    if (method === "none") {
      return buildDeliveryView({ method, price: 0, commune, confirmed: false });
    }
    if (method === "pickup") {
      return buildDeliveryView({ method, price: 0, commune, confirmed: true });
    }

    const regions = await prisma.tenantDeliveryRegion.findMany({
      where: { tenantId, isActive: true },
      include: { communes: true }
    });
    const matched = matchDeliveryCommune(
      regions.map((region) => ({
        name: region.name,
        courier: region.courier,
        defaultPrice: region.defaultPrice,
        communes: region.communes.map((item) => ({
          name: item.name,
          priceOverride: item.priceOverride
        }))
      })),
      { method: "delivery", commune }
    );

    const confirmed = Boolean(commune && matched.commune);
    return buildDeliveryView({
      method: "delivery",
      price: confirmed ? matched.price : 0,
      commune: matched.commune ?? commune,
      confirmed
    });
  }

  private toQuoteCreateData(
    conversation: QuoteConversation,
    preview: ProductQuotePreview,
    createdBy: ProductQuoteCreatedBy
  ) {
    return {
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      quoteNumber: preview.quote_number,
      createdBy,
      status: ProductQuoteStatus.ISSUED,
      customerNote: preview.customer_note,
      deliveryMethod: preview.delivery.method,
      commune: preview.delivery.commune,
      currency: preview.currency,
      productsSubtotal: preview.products_subtotal,
      deliveryPrice: preview.delivery_price,
      total: preview.total,
      linesJson: preview.lines as unknown as Prisma.InputJsonValue,
      notesJson: preview.notes as unknown as Prisma.InputJsonValue
    };
  }

  private async allocateQuoteNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `COT-${year}-`;
    const existing = await prisma.productQuote.findMany({
      where: { tenantId, quoteNumber: { startsWith: prefix } },
      select: { quoteNumber: true },
      orderBy: { quoteNumber: "desc" },
      take: 50
    });
    return nextQuoteNumber(
      existing.map((row) => row.quoteNumber),
      year
    );
  }

  private async loadConversation(conversationId: string): Promise<QuoteConversation> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        tenant: { select: { id: true, name: true } },
        customer: { select: { name: true, displayAlias: true, phoneNumber: true } }
      }
    });
    if (!conversation) {
      throw new ProductQuoteHttpError("Conversación no encontrada", 404, "conversation_not_found");
    }
    return conversation;
  }

  private async loadActiveChannel(_preview: ProductQuotePreview, conversationId: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        tenant: {
          include: {
            channels: {
              where: { isActive: true, status: "ACTIVE" },
              take: 1
            }
          }
        }
      }
    });
    const channel = conversation?.tenant.channels[0];
    if (!channel) {
      throw new ProductQuoteHttpError(
        "No hay un canal de WhatsApp activo para este negocio",
        400,
        "no_channel"
      );
    }
    return channel;
  }

  private async recentCustomerAndBotText(conversationId: string): Promise<string> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { contentText: true }
    });
    return messages
      .map((message) => message.contentText)
      .reverse()
      .join("\n");
  }
}

function looksLikeVehicleNote(text: string): boolean {
  return /\b(toyota|hyundai|chevrolet|nissan|kia|ford|suzuki|mazda|honda|vw|volkswagen|hilux|spark|accent|ranger)\b/i.test(
    text
  );
}

function isUniqueQuoteNumberError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export const productQuoteService = new ProductQuoteService();
