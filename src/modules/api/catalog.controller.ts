import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { catalogService } from "../catalog/catalog.service.js";
import { paramId } from "../../utils/params.js";
import { requireTenantExists } from "../../utils/tenant-resource.js";

const shopifySchema = z.object({
  shop_domain: z.string().min(1),
  access_token: z.string().min(1)
});

export async function listCatalogProducts(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const products = await prisma.tenantCatalogProduct.findMany({
    where: { tenantId: businessId, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }]
  });
  res.json(products);
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
