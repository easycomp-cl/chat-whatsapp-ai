import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { catalogService } from "../catalog/catalog.service.js";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";
import { vehicleFitmentService } from "../vehicles/vehicle-fitment.service.js";
import { vehiclePlateService } from "../vehicles/vehicle-plate.service.js";

const shopifySchema = z.object({
  shop_domain: z.string().min(1),
  access_token: z.string().min(1)
});

function serializeCatalogProduct(product: {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  category: string | null;
  tags: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const tags = Array.isArray(product.tags)
    ? product.tags.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: product.id,
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price,
    currency: product.currency,
    category: product.category,
    tags,
    isActive: product.isActive,
    is_active: product.isActive,
    createdAt: product.createdAt,
    created_at: product.createdAt,
    updatedAt: product.updatedAt,
    updated_at: product.updatedAt
  };
}

export async function listCatalogProducts(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const query = z
    .object({
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.coerce.number().int().optional(),
      plate: z.string().optional(),
      part_type: z.string().optional()
    })
    .parse(req.query);

  if (query.make || query.model || query.plate || query.year) {
    let vehicle = vehicleFitmentService.resolveVehicle({
      ...(query.make ? { make: query.make } : {}),
      ...(query.model ? { model: query.model } : {}),
      ...(query.year != null ? { year: query.year } : {})
    });
    if (!vehicle && query.plate) {
      vehicle = (await vehiclePlateService.lookup(query.plate)).vehicle;
    }
    if (vehicle) {
      const fitment = await vehicleFitmentService.findCompatible({
        tenantId: businessId,
        vehicle,
        ...(query.part_type ? { partType: query.part_type } : {})
      });
      res.json(
        fitment.compatible.map((product) => ({
          id: product.id,
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          description: null,
          price: product.price,
          currency: product.currency,
          category: product.category,
          tags: [],
          isActive: product.in_stock,
          is_active: product.in_stock,
          part_type: product.part_type,
          part_label: product.part_label,
          fitment_spec: product.spec,
          fitment_match: product.match
        }))
      );
      return;
    }
  }

  const products = await prisma.tenantCatalogProduct.findMany({
    where: { tenantId: businessId, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }]
  });
  res.json(products.map(serializeCatalogProduct));
}

export async function importCatalogCsv(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const csvText =
    typeof req.body.csv_text === "string"
      ? req.body.csv_text
      : typeof req.body.csv === "string"
        ? req.body.csv
        : null;

  if (!csvText?.trim()) {
    res.status(400).json({ error: "csv_text or csv field is required" });
    return;
  }

  try {
    const result = await catalogService.importCsv(businessId, csvText);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "CSV import failed" });
  }
}

export async function importCatalogJson(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  try {
    const result = await catalogService.importJson(businessId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "JSON import failed" });
  }
}

export async function connectShopify(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const body = shopifySchema.parse(req.body);
  await catalogService.connectShopify(businessId, body.shop_domain, body.access_token);
  res.status(201).json({ connected: true, provider: "SHOPIFY" });
}

export async function syncShopifyCatalog(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  if (!(await requireTenantExists(businessId))) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  try {
    const result = await catalogService.syncShopify(businessId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Shopify sync failed" });
  }
}

export async function getShopifyIntegration(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const integration = await prisma.tenantIntegration.findUnique({
    where: { tenantId_provider: { tenantId: businessId, provider: "SHOPIFY" } },
    select: {
      id: true,
      provider: true,
      shopDomain: true,
      lastSyncAt: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });
  res.json(integration ?? { connected: false });
}
