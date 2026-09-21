import { prisma } from "../src/lib/prisma.js";
import {
  UNIVERSAL_PART_SKUS,
  VEHICLE_MAKES,
  VEHICLE_SEED,
  wiperSkusFromSpec
} from "../src/modules/vehicles/vehicle-catalog.js";

async function seedGlobalCatalog() {
  for (const make of VEHICLE_MAKES) {
    await prisma.vehicleMake.upsert({
      where: { slug: make.slug },
      create: { slug: make.slug, name: make.name, aliases: make.aliases },
      update: { name: make.name, aliases: make.aliases }
    });
  }

  for (const model of VEHICLE_SEED) {
    const make = await prisma.vehicleMake.findUnique({ where: { slug: model.makeSlug } });
    if (!make) continue;
    const saved = await prisma.vehicleModel.upsert({
      where: {
        makeId_slug_yearFrom: {
          makeId: make.id,
          slug: model.slug,
          yearFrom: model.yearFrom
        }
      },
      create: {
        makeId: make.id,
        slug: model.slug,
        name: model.name,
        yearFrom: model.yearFrom,
        yearTo: model.yearTo ?? null,
        engine: model.engine ?? null,
        aliases: model.aliases ?? [],
        notes: model.notes ?? null
      },
      update: {
        name: model.name,
        yearTo: model.yearTo ?? null,
        engine: model.engine ?? null,
        aliases: model.aliases ?? [],
        notes: model.notes ?? null
      }
    });

    for (const fitment of model.fitments) {
      await prisma.vehicleFitment.upsert({
        where: {
          vehicleModelId_partType: {
            vehicleModelId: saved.id,
            partType: fitment.partType
          }
        },
        create: {
          vehicleModelId: saved.id,
          partType: fitment.partType,
          skuHint: fitment.skuHint ?? null,
          spec: fitment.spec ?? null,
          notes: fitment.notes ?? null,
          confidence: "beta"
        },
        update: {
          skuHint: fitment.skuHint ?? null,
          spec: fitment.spec ?? null,
          notes: fitment.notes ?? null
        }
      });
    }
  }
}

async function seedTenantSkuLinks(tenantId: string) {
  const products = await prisma.tenantCatalogProduct.findMany({
    where: { tenantId, isActive: true, sku: { not: null } }
  });
  const bySku = new Map(products.map((product) => [(product.sku ?? "").toUpperCase(), product]));

  const universalEntries = Object.entries(UNIVERSAL_PART_SKUS);
  for (const [partType, skus] of universalEntries) {
    for (const sku of skus) {
      const product = bySku.get(sku);
      if (!product) continue;
      const existing = await prisma.catalogProductFitment.findFirst({
        where: { tenantCatalogProductId: product.id, partType, isUniversal: true }
      });
      if (existing) continue;
      await prisma.catalogProductFitment.create({
        data: {
          tenantCatalogProductId: product.id,
          partType,
          isUniversal: true
        }
      });
    }
  }

  for (const model of VEHICLE_SEED) {
    for (const fitment of model.fitments) {
      const skus = [
        fitment.skuHint,
        ...(fitment.partType === "wiper" ? wiperSkusFromSpec(fitment.spec) : [])
      ]
        .filter((sku): sku is string => Boolean(sku))
        .map((sku) => sku.toUpperCase());
      for (const sku of skus) {
        const product = bySku.get(sku);
        if (!product) continue;
        const existing = await prisma.catalogProductFitment.findFirst({
          where: {
            tenantCatalogProductId: product.id,
            partType: fitment.partType,
            isUniversal: false
          }
        });
        if (existing) continue;
        await prisma.catalogProductFitment.create({
          data: {
            tenantCatalogProductId: product.id,
            partType: fitment.partType,
            isUniversal: false,
            notes: fitment.notes ?? null
          }
        });
      }
    }
  }
}

async function main() {
  await seedGlobalCatalog();
  const tenantId = process.env.TENANT_ID?.trim();
  if (tenantId) {
    await seedTenantSkuLinks(tenantId);
    console.log(`Fitment global + links de catálogo para tenant ${tenantId}`);
  } else {
    console.log("Fitment global listo. Pasa TENANT_ID para vincular SKUs del negocio.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
