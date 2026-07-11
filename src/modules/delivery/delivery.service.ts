import { prisma } from "../../lib/prisma.js";
import { enqueueKnowledgeIndex } from "../queue/knowledge-index.queue.js";
import { findChileCommunes } from "./chile-regions.js";
import { buildDeliveryRawText, DELIVERY_DOC_TITLE } from "./delivery-text.js";

export class DeliveryService {
  async listRegions(tenantId: string) {
    return prisma.tenantDeliveryRegion.findMany({
      where: { tenantId },
      include: {
        communes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
  }

  async createRegion(
    tenantId: string,
    data: {
      name: string;
      courier: string;
      default_price: number;
      active?: boolean;
      seed_communes?: boolean;
    }
  ) {
    const region = await prisma.tenantDeliveryRegion.create({
      data: {
        tenantId,
        name: data.name.trim(),
        courier: data.courier.trim(),
        defaultPrice: Math.round(data.default_price),
        isActive: data.active ?? true
      }
    });

    if (data.seed_communes) {
      await this.seedCommunesForRegion(region.id, region.name);
    }

    await this.rebuildDeliveryDocument(tenantId);
    return this.getRegion(region.id, tenantId);
  }

  async patchRegion(
    tenantId: string,
    regionId: string,
    data: Partial<{
      name: string;
      courier: string;
      default_price: number;
      active: boolean;
      sort_order: number;
    }>
  ) {
    await this.requireRegion(regionId, tenantId);
    await prisma.tenantDeliveryRegion.update({
      where: { id: regionId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.courier !== undefined ? { courier: data.courier.trim() } : {}),
        ...(data.default_price !== undefined
          ? { defaultPrice: Math.round(data.default_price) }
          : {}),
        ...(data.active !== undefined ? { isActive: data.active } : {}),
        ...(data.sort_order !== undefined ? { sortOrder: data.sort_order } : {})
      }
    });
    await this.rebuildDeliveryDocument(tenantId);
    return this.getRegion(regionId, tenantId);
  }

  async deleteRegion(tenantId: string, regionId: string) {
    await this.requireRegion(regionId, tenantId);
    await prisma.tenantDeliveryRegion.delete({ where: { id: regionId } });
    await this.rebuildDeliveryDocument(tenantId);
  }

  async createCommune(
    tenantId: string,
    regionId: string,
    data: { name: string; price_override?: number | null; active?: boolean }
  ) {
    await this.requireRegion(regionId, tenantId);
    await prisma.tenantDeliveryCommune.create({
      data: {
        regionId,
        name: data.name.trim(),
        priceOverride:
          data.price_override != null ? Math.round(data.price_override) : null,
        isActive: data.active ?? true
      }
    });
    await this.rebuildDeliveryDocument(tenantId);
    return this.getRegion(regionId, tenantId);
  }

  async patchCommune(
    tenantId: string,
    regionId: string,
    communeId: string,
    data: Partial<{
      name: string;
      price_override: number | null;
      active: boolean;
      sort_order: number;
    }>
  ) {
    await this.requireCommune(communeId, regionId, tenantId);
    await prisma.tenantDeliveryCommune.update({
      where: { id: communeId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.price_override !== undefined
          ? {
              priceOverride:
                data.price_override != null ? Math.round(data.price_override) : null
            }
          : {}),
        ...(data.active !== undefined ? { isActive: data.active } : {}),
        ...(data.sort_order !== undefined ? { sortOrder: data.sort_order } : {})
      }
    });
    await this.rebuildDeliveryDocument(tenantId);
    return this.getRegion(regionId, tenantId);
  }

  async deleteCommune(tenantId: string, regionId: string, communeId: string) {
    await this.requireCommune(communeId, regionId, tenantId);
    await prisma.tenantDeliveryCommune.delete({ where: { id: communeId } });
    await this.rebuildDeliveryDocument(tenantId);
    return this.getRegion(regionId, tenantId);
  }

  async seedCommunes(tenantId: string, regionId: string) {
    const region = await this.requireRegion(regionId, tenantId);
    const count = await this.seedCommunesForRegion(region.id, region.name);
    await this.rebuildDeliveryDocument(tenantId);
    return { seeded: count, region: await this.getRegion(regionId, tenantId) };
  }

  private async seedCommunesForRegion(regionId: string, regionName: string) {
    const names = findChileCommunes(regionName);
    if (!names?.length) return 0;

    const existing = await prisma.tenantDeliveryCommune.findMany({
      where: { regionId },
      select: { name: true }
    });
    const existingSet = new Set(existing.map((c) => c.name.toLowerCase()));
    let count = 0;

    for (const [index, name] of names.entries()) {
      if (existingSet.has(name.toLowerCase())) continue;
      await prisma.tenantDeliveryCommune.create({
        data: { regionId, name, sortOrder: index, isActive: true }
      });
      count++;
    }
    return count;
  }

  private async getRegion(regionId: string, tenantId: string) {
    const region = await prisma.tenantDeliveryRegion.findFirst({
      where: { id: regionId, tenantId },
      include: {
        communes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }
      }
    });
    if (!region) throw new Error("Región no encontrada");
    return region;
  }

  private async requireRegion(regionId: string, tenantId: string) {
    const region = await this.getRegion(regionId, tenantId);
    return region;
  }

  private async requireCommune(
    communeId: string,
    regionId: string,
    tenantId: string
  ) {
    await this.requireRegion(regionId, tenantId);
    const commune = await prisma.tenantDeliveryCommune.findFirst({
      where: { id: communeId, regionId }
    });
    if (!commune) throw new Error("Comuna no encontrada");
    return commune;
  }

  async rebuildDeliveryDocument(tenantId: string) {
    const regions = await this.listRegions(tenantId);
    const rawText = buildDeliveryRawText(
      regions.map((r) => ({
        name: r.name,
        courier: r.courier,
        defaultPrice: r.defaultPrice,
        isActive: r.isActive,
        communes: r.communes.map((c) => ({
          name: c.name,
          priceOverride: c.priceOverride,
          isActive: c.isActive
        }))
      }))
    );

    let document = await prisma.tenantDocument.findFirst({
      where: { tenantId, title: DELIVERY_DOC_TITLE }
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
          title: DELIVERY_DOC_TITLE,
          sourceType: "MANUAL",
          rawText,
          status: "PENDING"
        }
      });
    }

    await enqueueKnowledgeIndex(document.id, tenantId);
    return { documentId: document.id };
  }
}

export const deliveryService = new DeliveryService();

function serializeRegion(region: Awaited<ReturnType<DeliveryService["listRegions"]>>[number]) {
  return {
    id: region.id,
    business_id: region.tenantId,
    name: region.name,
    courier: region.courier,
    default_price: region.defaultPrice,
    is_active: region.isActive,
    sort_order: region.sortOrder,
    communes: region.communes.map((c) => ({
      id: c.id,
      region_id: c.regionId,
      name: c.name,
      price_override: c.priceOverride,
      is_active: c.isActive,
      sort_order: c.sortOrder,
      effective_price: c.priceOverride ?? region.defaultPrice
    })),
    created_at: region.createdAt.toISOString(),
    updated_at: region.updatedAt.toISOString()
  };
}

export { serializeRegion };
