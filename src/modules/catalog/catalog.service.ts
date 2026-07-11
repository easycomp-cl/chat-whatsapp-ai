import type { CatalogProductSource } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { encryptionService } from "../../lib/encryption.service.js";
import { enqueueKnowledgeIndex } from "../queue/knowledge-index.queue.js";
import { buildCatalogRawText, type CatalogProductRow } from "./catalog-text.js";
import { shopifyService } from "./shopify.service.js";

const CATALOG_DOC_TITLE = "Catálogo de productos";

export type CatalogImportItem = {
  name: string;
  description?: string | undefined;
  price?: number | undefined;
  currency?: string | undefined;
  sku?: string | undefined;
  category?: string | undefined;
  tags?: string[] | undefined;
  external_id?: string | undefined;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

export class CatalogService {
  parseCsv(csvText: string): CatalogImportItem[] {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return [];
    }

    const headers = parseCsvLine(lines[0]!).map(normalizeHeader);
    const idx = (names: string[]) => headers.findIndex((h) => names.includes(h));

    const nameIdx = idx(["name", "nombre", "producto", "title", "titulo"]);
    const descIdx = idx(["description", "descripcion", "detalle"]);
    const priceIdx = idx(["price", "precio", "valor"]);
    const skuIdx = idx(["sku", "codigo", "code"]);
    const catIdx = idx(["category", "categoria", "rubro"]);
    const tagsIdx = idx(["tags", "etiquetas"]);

    if (nameIdx < 0) {
      throw new Error("CSV debe incluir columna name/nombre/producto");
    }

    return lines.slice(1).map((line) => {
      const cols = parseCsvLine(line);
      const priceRaw = priceIdx >= 0 ? cols[priceIdx] : undefined;
      const price = priceRaw ? Number.parseFloat(priceRaw.replace(/[^0-9.,]/g, "").replace(",", ".")) : undefined;
      return {
        name: cols[nameIdx] ?? "",
        description: descIdx >= 0 ? cols[descIdx] : undefined,
        price: Number.isFinite(price) ? price : undefined,
        sku: skuIdx >= 0 ? cols[skuIdx] : undefined,
        category: catIdx >= 0 ? cols[catIdx] : undefined,
        tags: tagsIdx >= 0 && cols[tagsIdx] ? cols[tagsIdx]!.split(";").map((t) => t.trim()) : undefined
      };
    }).filter((item) => item.name.trim());
  }

  parseJson(payload: unknown): CatalogImportItem[] {
    const rows = Array.isArray(payload) ? payload : (payload as { products?: unknown[] })?.products;
    if (!Array.isArray(rows)) {
      throw new Error("JSON debe ser un array de productos o { products: [] }");
    }
    return rows.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        name: String(item.name ?? item.nombre ?? item.title ?? ""),
        description: item.description ? String(item.description) : item.descripcion ? String(item.descripcion) : undefined,
        price: typeof item.price === "number" ? item.price : item.precio ? Number(item.precio) : undefined,
        currency: item.currency ? String(item.currency) : undefined,
        sku: item.sku ? String(item.sku) : undefined,
        category: item.category ? String(item.category) : item.categoria ? String(item.categoria) : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : undefined,
        external_id: item.external_id ? String(item.external_id) : item.id ? String(item.id) : undefined
      };
    }).filter((item) => item.name.trim());
  }

  async upsertProducts(
    tenantId: string,
    items: CatalogImportItem[],
    source: CatalogProductSource
  ): Promise<number> {
    let count = 0;
    for (const item of items) {
      const externalId = item.external_id ?? item.sku ?? null;
      const data = {
        tenantId,
        name: item.name.trim(),
        description: item.description?.trim() ?? null,
        price: item.price ?? null,
        currency: item.currency ?? "CLP",
        sku: item.sku?.trim() ?? null,
        category: item.category?.trim() ?? null,
        tags: item.tags ?? [],
        source,
        isActive: true
      };

      if (externalId) {
        await prisma.tenantCatalogProduct.upsert({
          where: { tenantId_externalId: { tenantId, externalId } },
          create: { ...data, externalId },
          update: data
        });
      } else {
        await prisma.tenantCatalogProduct.create({ data });
      }
      count++;
    }
    return count;
  }

  async rebuildCatalogDocument(tenantId: string): Promise<{ documentId: string }> {
    const products = await prisma.tenantCatalogProduct.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }]
    });

    const rows: CatalogProductRow[] = products.map((p) => ({
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      sku: p.sku,
      category: p.category,
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : []
    }));

    const rawText = buildCatalogRawText(rows);
    let document = await prisma.tenantDocument.findFirst({
      where: { tenantId, title: CATALOG_DOC_TITLE }
    });

    if (document) {
      document = await prisma.tenantDocument.update({
        where: { id: document.id },
        data: { rawText, status: "PENDING", indexError: null }
      });
    } else {
      document = await prisma.tenantDocument.create({
        data: {
          tenantId,
          title: CATALOG_DOC_TITLE,
          sourceType: "MANUAL",
          rawText,
          status: "PENDING"
        }
      });
    }

    await enqueueKnowledgeIndex(document.id, tenantId);
    return { documentId: document.id };
  }

  async importCsv(tenantId: string, csvText: string) {
    const items = this.parseCsv(csvText);
    const count = await this.upsertProducts(tenantId, items, "CSV");
    const doc = await this.rebuildCatalogDocument(tenantId);
    return { products_imported: count, ...doc };
  }

  async importJson(tenantId: string, payload: unknown) {
    const items = this.parseJson(payload);
    const count = await this.upsertProducts(tenantId, items, "JSON");
    const doc = await this.rebuildCatalogDocument(tenantId);
    return { products_imported: count, ...doc };
  }

  async syncShopify(tenantId: string) {
    const integration = await prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider: "SHOPIFY" } }
    });
    if (!integration?.isActive || !integration.shopDomain || !integration.credentialsEncrypted) {
      throw new Error("Shopify no está configurado para este negocio");
    }

    const accessToken = encryptionService.decrypt(integration.credentialsEncrypted);
    const products = await shopifyService.fetchProducts(integration.shopDomain, accessToken);

    const items: CatalogImportItem[] = products.map((p) => ({
      name: p.name,
      description: p.description ?? undefined,
      price: p.price ?? undefined,
      currency: p.currency,
      sku: p.sku ?? undefined,
      category: p.category ?? undefined,
      tags: p.tags,
      external_id: p.externalId
    }));

    const count = await this.upsertProducts(tenantId, items, "SHOPIFY");
    await prisma.tenantIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() }
    });

    const doc = await this.rebuildCatalogDocument(tenantId);
    return { products_synced: count, ...doc };
  }

  async connectShopify(tenantId: string, shopDomain: string, accessToken: string) {
    const encrypted = encryptionService.encrypt(accessToken);
    await prisma.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId, provider: "SHOPIFY" } },
      create: {
        tenantId,
        provider: "SHOPIFY",
        shopDomain: shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        credentialsEncrypted: encrypted,
        isActive: true
      },
      update: {
        shopDomain: shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        credentialsEncrypted: encrypted,
        isActive: true
      }
    });
  }
}

export const catalogService = new CatalogService();
