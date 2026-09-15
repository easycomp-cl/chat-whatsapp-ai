import { prisma } from "../../lib/prisma.js";
import { getNestedValue } from "./domain/flow-graph.utils.js";
import { upsertSlot, type FlowVariablesState } from "./domain/flow-slots.js";

export interface FlowQuoteItem {
  sku: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization?: {
    type: string;
    adaptationPrice?: number;
    requiresAdaptation?: boolean;
  };
}

export interface FlowQuotePricing {
  currency: string;
  itemsSubtotal: number;
  customizationSubtotal: number;
  deliverySubtotal: number;
  total: number;
}

export interface FlowQuoteResult {
  product: {
    matchedProductId: string | null;
    sku: string | null;
    name: string;
    unitPrice: number;
  };
  items: FlowQuoteItem[];
  delivery: {
    method: string;
    price: number;
    commune: string | null;
    region: string | null;
    courier: string | null;
    requiredDate: string | null;
  };
  pricing: FlowQuotePricing;
  flatUpdates: Record<string, unknown>;
}

type CatalogProduct = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  category: string | null;
  tags: unknown;
  metadata: unknown;
};

const DEFAULT_LOGO_ADAPTATION_PRICE = 15_000;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function readString(variables: Record<string, unknown>, key: string): string | null {
  const value = getNestedValue(variables, key);
  if (value == null) {
    return null;
  }
  return String(value).trim() || null;
}

function readNumber(variables: Record<string, unknown>, key: string, fallback = 0): number {
  const value = getNestedValue(variables, key);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function scoreProduct(
  product: CatalogProduct,
  input: { wood?: string | null; size?: string | null; type?: string | null }
): number {
  const haystack = normalizeText(
    [product.name, product.description ?? "", product.category ?? "", JSON.stringify(product.metadata ?? {})].join(
      " "
    )
  );
  let score = 0;

  if (input.wood && haystack.includes(normalizeText(input.wood))) {
    score += 4;
  }
  if (input.size && haystack.includes(normalizeText(input.size))) {
    score += 3;
  }
  if (input.type && haystack.includes(normalizeText(input.type))) {
    score += 2;
  }
  if (product.price != null) {
    score += 1;
  }

  return score;
}

export function pickCatalogProduct(
  products: CatalogProduct[],
  input: { wood?: string | null; size?: string | null; type?: string | null }
): CatalogProduct | null {
  if (products.length === 0) {
    return null;
  }

  const ranked = products
    .map((product) => ({ product, score: scoreProduct(product, input) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked[0]) {
    return ranked[0].product;
  }

  return products.find((p) => p.price != null) ?? products[0] ?? null;
}

export function matchDeliveryCommune(
  regions: Array<{
    name: string;
    courier: string;
    defaultPrice: number;
    communes: Array<{ name: string; priceOverride: number | null }>;
  }>,
  input: {
    method?: string | null;
    commune?: string | null;
    region?: string | null;
  }
): {
  price: number;
  commune: string | null;
  region: string | null;
  courier: string | null;
} {
  const method = normalizeText(input.method ?? "delivery");
  if (method === "pickup" || method === "retiro") {
    return { price: 0, commune: input.commune ?? null, region: input.region ?? null, courier: null };
  }

  const communeName = input.commune?.trim();
  if (!communeName) {
    return { price: 0, commune: null, region: input.region ?? null, courier: null };
  }

  const target = normalizeText(communeName);

  for (const region of regions) {
    if (input.region && normalizeText(region.name) !== normalizeText(input.region)) {
      continue;
    }

    const commune = region.communes.find((c) => normalizeText(c.name) === target);
    if (commune) {
      return {
        price: commune.priceOverride ?? region.defaultPrice,
        commune: commune.name,
        region: region.name,
        courier: region.courier
      };
    }
  }

  for (const region of regions) {
    const commune = region.communes.find((c) => normalizeText(c.name).includes(target));
    if (commune) {
      return {
        price: commune.priceOverride ?? region.defaultPrice,
        commune: commune.name,
        region: region.name,
        courier: region.courier
      };
    }
  }

  const fallbackRegion = regions[0];
  return {
    price: fallbackRegion?.defaultPrice ?? 0,
    commune: communeName,
    region: input.region ?? fallbackRegion?.name ?? null,
    courier: fallbackRegion?.courier ?? null
  };
}

export async function resolveDeliveryPrice(
  tenantId: string,
  input: {
    method?: string | null;
    commune?: string | null;
    region?: string | null;
  }
): Promise<{
  price: number;
  commune: string | null;
  region: string | null;
  courier: string | null;
}> {
  const regions = await prisma.tenantDeliveryRegion.findMany({
    where: { tenantId, isActive: true },
    include: { communes: { where: { isActive: true } } }
  });

  return matchDeliveryCommune(
    regions.map((region) => ({
      name: region.name,
      courier: region.courier,
      defaultPrice: region.defaultPrice,
      communes: region.communes.map((commune) => ({
        name: commune.name,
        priceOverride: commune.priceOverride
      }))
    })),
    input
  );
}

export async function enrichVariablesFromCustomer(
  tenantId: string,
  customerId: string,
  variables: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: {
      name: true,
      email: true,
      phoneNumber: true,
      delivery1Commune: true,
      delivery1Region: true,
      delivery1Line1: true,
      delivery1Line2: true
    }
  });

  if (!customer) {
    return variables;
  }

  const enriched = { ...variables };

  if (!readString(enriched, "customer.name") && customer.name) {
    enriched.customer = {
      ...(typeof enriched.customer === "object" && enriched.customer ? enriched.customer : {}),
      name: customer.name
    };
  }
  if (!readString(enriched, "customer.email") && customer.email) {
    enriched.customer = {
      ...(typeof enriched.customer === "object" && enriched.customer ? enriched.customer : {}),
      email: customer.email,
      phone: customer.phoneNumber
    };
  }
  if (!readString(enriched, "delivery.commune") && customer.delivery1Commune) {
    enriched.delivery = {
      ...(typeof enriched.delivery === "object" && enriched.delivery ? enriched.delivery : {}),
      commune: customer.delivery1Commune,
      region: customer.delivery1Region,
      address: [customer.delivery1Line1, customer.delivery1Line2].filter(Boolean).join(", ") || null
    };
  }

  return enriched;
}

export class FlowQuoteService {
  async calculateQuote(input: {
    tenantId: string;
    customerId: string;
    variables: Record<string, unknown>;
    config?: {
      useCatalog?: boolean;
      useDelivery?: boolean;
      logoAdaptationPrice?: number;
      fallbackUnitPrice?: number;
    };
  }): Promise<FlowQuoteResult> {
    const config = input.config ?? {};
    const mergedVariables = await enrichVariablesFromCustomer(
      input.tenantId,
      input.customerId,
      input.variables
    );

    const quantity = readNumber(mergedVariables, "product.quantity", 1);
    const wood = readString(mergedVariables, "product.wood");
    const size = readString(mergedVariables, "product.size");
    const productType = readString(mergedVariables, "product.type");
    const engravingType = readString(mergedVariables, "engraving.type");
    const deliveryMethod = readString(mergedVariables, "delivery.method");
    const deliveryCommune = readString(mergedVariables, "delivery.commune");
    const deliveryRegion = readString(mergedVariables, "delivery.region");
    const requiredDate = readString(mergedVariables, "delivery.requiredDate");

    let matchedProduct: CatalogProduct | null = null;
    let unitPrice = config.fallbackUnitPrice ?? 32_000;
    let currency = "CLP";
    let productName = productType ?? "Producto personalizado";

    if (config.useCatalog !== false) {
      const products = await prisma.tenantCatalogProduct.findMany({
        where: { tenantId: input.tenantId, isActive: true },
        select: {
          id: true,
          sku: true,
          name: true,
          description: true,
          price: true,
          currency: true,
          category: true,
          tags: true,
          metadata: true
        }
      });

      matchedProduct = pickCatalogProduct(products, {
        wood,
        size,
        type: productType
      });

      if (matchedProduct) {
        unitPrice = matchedProduct.price ?? unitPrice;
        currency = matchedProduct.currency;
        productName = matchedProduct.name;
      }
    }

    const itemsSubtotal = Math.round(quantity * unitPrice);
    const logoAdaptationPrice = config.logoAdaptationPrice ?? DEFAULT_LOGO_ADAPTATION_PRICE;
    const customizationSubtotal =
      engravingType === "logo" ? logoAdaptationPrice : engravingType === "text" ? 0 : 0;

    let deliverySubtotal = 0;
    let deliveryCommuneResolved = deliveryCommune;
    let deliveryRegionResolved = deliveryRegion;
    let courier: string | null = null;

    if (config.useDelivery !== false) {
      const delivery = await resolveDeliveryPrice(input.tenantId, {
        method: deliveryMethod,
        commune: deliveryCommune,
        region: deliveryRegion
      });
      deliverySubtotal = delivery.price;
      deliveryCommuneResolved = delivery.commune;
      deliveryRegionResolved = delivery.region;
      courier = delivery.courier;
    }

    const total = itemsSubtotal + customizationSubtotal + deliverySubtotal;

    const item: FlowQuoteItem = {
      sku: matchedProduct?.sku ?? null,
      name: productName,
      quantity,
      unitPrice,
      subtotal: itemsSubtotal,
      ...(engravingType
        ? {
            customization: {
              type: engravingType,
              ...(engravingType === "logo"
                ? {
                    requiresAdaptation: true,
                    adaptationPrice: logoAdaptationPrice
                  }
                : {})
            }
          }
        : {})
    };

    const pricing: FlowQuotePricing = {
      currency,
      itemsSubtotal,
      customizationSubtotal,
      deliverySubtotal,
      total
    };

    const flatUpdates: Record<string, unknown> = {
      product: {
        ...(typeof mergedVariables.product === "object" && mergedVariables.product
          ? mergedVariables.product
          : {}),
        matchedProductId: matchedProduct?.id ?? null,
        sku: matchedProduct?.sku ?? null,
        name: productName,
        unitPrice
      },
      quote: {
        currency,
        total,
        unitPrice,
        items: [item],
        pricing
      },
      delivery: {
        ...(typeof mergedVariables.delivery === "object" && mergedVariables.delivery
          ? mergedVariables.delivery
          : {}),
        method: deliveryMethod ?? "delivery",
        commune: deliveryCommuneResolved,
        region: deliveryRegionResolved,
        courier,
        price: deliverySubtotal,
        requiredDate
      }
    };

    return {
      product: {
        matchedProductId: matchedProduct?.id ?? null,
        sku: matchedProduct?.sku ?? null,
        name: productName,
        unitPrice
      },
      items: [item],
      delivery: {
        method: deliveryMethod ?? "delivery",
        price: deliverySubtotal,
        commune: deliveryCommuneResolved,
        region: deliveryRegionResolved,
        courier,
        requiredDate
      },
      pricing,
      flatUpdates
    };
  }

  buildQuoteResultFromVariables(variables: Record<string, unknown>): FlowQuoteResult | null {
    const total = getNestedValue(variables, "quote.total");
    if (total == null) {
      return null;
    }

    const pricing = getNestedValue(variables, "quote.pricing") as FlowQuotePricing | undefined;
    const items = getNestedValue(variables, "quote.items") as FlowQuoteItem[] | undefined;

    return {
      product: {
        matchedProductId: readString(variables, "product.matchedProductId"),
        sku: readString(variables, "product.sku"),
        name: readString(variables, "product.name") ?? "Producto",
        unitPrice: readNumber(variables, "product.unitPrice", 0)
      },
      items: items ?? [],
      delivery: {
        method: readString(variables, "delivery.method") ?? "delivery",
        price: readNumber(variables, "delivery.price", 0),
        commune: readString(variables, "delivery.commune"),
        region: readString(variables, "delivery.region"),
        courier: readString(variables, "delivery.courier"),
        requiredDate: readString(variables, "delivery.requiredDate")
      },
      pricing: pricing ?? {
        currency: readString(variables, "quote.currency") ?? "CLP",
        itemsSubtotal: 0,
        customizationSubtotal: 0,
        deliverySubtotal: readNumber(variables, "delivery.price", 0),
        total: Number(total)
      },
      flatUpdates: {}
    };
  }

  buildQuoteConfirmedPayload(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    flowDefinitionId: string;
    flowVersion: number;
    runId: string;
    quote: FlowQuoteResult;
    customer?: { name?: string | null; phone?: string | null; email?: string | null };
    confirmed?: boolean;
  }) {
    return {
      schemaVersion: "1.0",
      eventType: "quote.confirmed",
      eventId: `evt_${input.runId}`,
      createdAt: new Date().toISOString(),
      organization: { id: input.tenantId },
      conversation: {
        id: input.conversationId,
        channel: "whatsapp",
        contactId: input.customerId
      },
      flow: {
        definitionId: input.flowDefinitionId,
        version: input.flowVersion,
        runId: input.runId
      },
      customer: {
        name: input.customer?.name ?? null,
        phone: input.customer?.phone ?? null,
        email: input.customer?.email ?? null
      },
      quote: {
        currency: input.quote.pricing.currency,
        items: input.quote.items,
        delivery: {
          method: input.quote.delivery.method,
          requiredDate: input.quote.delivery.requiredDate,
          commune: input.quote.delivery.commune,
          region: input.quote.delivery.region,
          courier: input.quote.delivery.courier,
          price: input.quote.delivery.price
        },
        pricing: input.quote.pricing
      },
      confirmation: {
        confirmedByCustomer: input.confirmed ?? true,
        confirmedAt: new Date().toISOString()
      },
      nextAction: {
        type: "create_production_request",
        requiresHumanApproval: true
      }
    };
  }
}

export const flowQuoteService = new FlowQuoteService();

export function applyQuoteFlatUpdates(
  state: FlowVariablesState,
  updates: Record<string, unknown>
): FlowVariablesState {
  const flat: Record<string, unknown> = { ...state.flat };
  for (const [key, value] of Object.entries(updates)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flat[key] = {
        ...(typeof flat[key] === "object" && flat[key] ? (flat[key] as Record<string, unknown>) : {}),
        ...(value as Record<string, unknown>)
      };
    } else {
      flat[key] = value;
    }
  }

  let next: FlowVariablesState = { ...state, flat };
  const slotPaths = [
    "quote.total",
    "quote.unitPrice",
    "quote.currency",
    "product.unitPrice",
    "product.sku",
    "product.name",
    "delivery.price",
    "delivery.commune",
    "delivery.region",
    "delivery.method"
  ];

  for (const path of slotPaths) {
    const value = getNestedValue(flat, path);
    if (value != null && value !== "") {
      next = upsertSlot(next, path, value, {
        sourceType: "integration",
        status: "confirmed"
      });
    }
  }

  return next;
}
