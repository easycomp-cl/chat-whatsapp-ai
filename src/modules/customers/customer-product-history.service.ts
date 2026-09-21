import { prisma } from "../../lib/prisma.js";
import { patchCustomerProfile } from "./customer-profile.service.js";
import {
  looksLikePurchaseConfirmation,
  readCustomerGarage,
  upsertGarageProduct,
  writeCustomerGarage,
  type StoredProductEvent
} from "./customer-garage.js";
import { matchCatalogProductsFromText } from "../quotes/product-quote-match.js";

export class CustomerProductHistoryService {
  async observeInbound(input: {
    tenantId: string;
    customerId: string;
    text: string;
  }) {
    const [customer, products] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: input.customerId, tenantId: input.tenantId },
        select: { profileMetadata: true }
      }),
      prisma.tenantCatalogProduct.findMany({
        where: { tenantId: input.tenantId, isActive: true },
        select: { id: true, sku: true, name: true, description: true, price: true, category: true, tags: true }
      })
    ]);
    if (!customer) return;

    const garage = readCustomerGarage(customer.profileMetadata);
    let changed = false;
    const matched = matchCatalogProductsFromText(input.text, products);
    if (matched.length) {
      const byId = new Map(products.map((product) => [product.id, product]));
      for (const line of matched.slice(0, 8)) {
        const product = byId.get(line.product_id);
        if (!product) continue;
        garage.products_consulted = upsertGarageProduct(garage.products_consulted, {
          product_id: product.id,
          ...(product.sku ? { sku: product.sku } : {}),
          name: product.name,
          quantity: line.quantity,
          ...(garage.active_vehicle_key ? { vehicle_key: garage.active_vehicle_key } : {}),
          source: "chat",
          at: new Date().toISOString()
        });
        changed = true;
      }
    }

    if (looksLikePurchaseConfirmation(input.text) && garage.products_quoted.length) {
      for (const item of garage.products_quoted.slice(0, 8)) {
        garage.products_purchased = upsertGarageProduct(garage.products_purchased, {
          ...item,
          source: "purchase",
          at: new Date().toISOString()
        });
      }
      changed = true;
    }

    if (!changed) return;
    await patchCustomerProfile({
      tenantId: input.tenantId,
      customerId: input.customerId,
      patch: {
        profile_updated_by: "BOT",
        profile_metadata: writeCustomerGarage(customer.profileMetadata, garage)
      }
    });
  }

  async recordQuoted(input: {
    tenantId: string;
    customerId: string;
    lines: Array<{ product_id: string; sku: string | null; name: string; quantity: number }>;
  }) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId },
      select: { profileMetadata: true }
    });
    if (!customer) return;
    const garage = readCustomerGarage(customer.profileMetadata);
    const at = new Date().toISOString();
    for (const line of input.lines) {
      const event: StoredProductEvent = {
        product_id: line.product_id,
        ...(line.sku ? { sku: line.sku } : {}),
        name: line.name,
        quantity: line.quantity,
        ...(garage.active_vehicle_key ? { vehicle_key: garage.active_vehicle_key } : {}),
        source: "quote",
        at
      };
      garage.products_quoted = upsertGarageProduct(garage.products_quoted, event);
      garage.products_consulted = upsertGarageProduct(garage.products_consulted, {
        ...event,
        source: "chat"
      });
    }
    await patchCustomerProfile({
      tenantId: input.tenantId,
      customerId: input.customerId,
      patch: {
        profile_updated_by: "BOT",
        profile_metadata: writeCustomerGarage(customer.profileMetadata, garage)
      }
    });
  }
}

export const customerProductHistoryService = new CustomerProductHistoryService();
