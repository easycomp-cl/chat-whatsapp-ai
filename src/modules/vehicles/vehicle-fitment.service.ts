import { prisma } from "../../lib/prisma.js";
import {
  PART_TYPE_LABELS,
  UNIVERSAL_PART_SKUS,
  findVehicleByMakeModelYear,
  resolveVehicleFromText,
  searchVehicleModels,
  wiperSkusFromSpec,
  type ResolvedVehicle,
  type SeedFitment
} from "./vehicle-catalog.js";

export type CompatibleCatalogProduct = {
  id: string;
  sku: string | null;
  name: string;
  price: number | null;
  currency: string;
  category: string | null;
  part_type: string;
  part_label: string;
  spec: string | null;
  notes: string | null;
  in_stock: boolean;
  match: "sku_hint" | "universal" | "mapped";
};

export type VehicleFitmentResult = {
  vehicle: ResolvedVehicle;
  requested_part_types: string[];
  compatible: CompatibleCatalogProduct[];
  missing: Array<{ part_type: string; part_label: string; notes: string | null }>;
};

function asTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((item): item is string => typeof item === "string");
}

function inferPartTypeFromProduct(product: {
  sku: string | null;
  category: string | null;
  tags: unknown;
  name: string;
}): string[] {
  const sku = (product.sku ?? "").toUpperCase();
  const blob = `${product.name} ${product.category ?? ""} ${asTags(product.tags).join(" ")}`.toLowerCase();
  const types: string[] = [];

  if (sku.startsWith("ECP-ACE-001") || sku.startsWith("ECP-ACE-002") || blob.includes("5w-30") || blob.includes("5w30")) {
    types.push("oil_5w30");
  }
  if (sku.startsWith("ECP-ACE-003") || sku.startsWith("ECP-ACE-004") || blob.includes("5w-40") || blob.includes("5w40")) {
    types.push("oil_5w40");
  }
  if (sku.startsWith("ECP-ACE-005") || sku.startsWith("ECP-ACE-006") || blob.includes("10w-40") || blob.includes("10w40")) {
    types.push("oil_10w40");
  }
  if (
    blob.includes("filtro de aceite") ||
    /^ECP-FIL-00[1-4]$/.test(sku)
  ) {
    types.push("oil_filter");
  }
  if (blob.includes("filtro de aire")) types.push("air_filter");
  if (blob.includes("cabina") || blob.includes("polen")) types.push("cabin_filter");
  if (blob.includes("pastilla") && blob.includes("delanter")) types.push("brake_pad_front");
  if (blob.includes("pastilla") && blob.includes("traser")) types.push("brake_pad_rear");
  if (blob.includes("iridium")) types.push("spark_plug_iridium");
  else if (blob.includes("buj")) types.push("spark_plug");
  if (blob.includes("escobilla") || blob.includes("limpiaparabrisas")) types.push("wiper");
  if (/\bh4\b/.test(blob)) types.push("bulb_h4");
  if (/\bh7\b/.test(blob)) types.push("bulb_h7");
  if (/\bh1\b/.test(blob)) types.push("bulb_h1");
  if (/\bh3\b/.test(blob)) types.push("bulb_h3");
  if (/\bhb3\b/.test(blob)) types.push("bulb_hb3");
  if (/\bhb4\b/.test(blob)) types.push("bulb_hb4");
  if (/\bw5w\b/.test(blob)) types.push("bulb_w5w");
  if (/\bp21w\b/.test(blob)) types.push("bulb_p21w");
  return [...new Set(types)];
}

function fitmentSkus(fitment: SeedFitment): string[] {
  const skus: string[] = [];
  if (fitment.skuHint) skus.push(fitment.skuHint.toUpperCase());
  skus.push(...(UNIVERSAL_PART_SKUS[fitment.partType] ?? []).map((sku) => sku.toUpperCase()));
  if (fitment.partType === "wiper") {
    skus.push(...wiperSkusFromSpec(fitment.spec).map((sku) => sku.toUpperCase()));
  }
  return [...new Set(skus)];
}

function filterFitments(fitments: SeedFitment[], partType?: string): SeedFitment[] {
  if (!partType) return fitments;
  return fitments.filter((item) => item.partType === partType);
}

export class VehicleFitmentService {
  resolveVehicle(input: {
    text?: string;
    make?: string;
    model?: string;
    year?: number;
  }): ResolvedVehicle | null {
    if (input.make || input.model) {
      const fromFields = findVehicleByMakeModelYear({
        ...(input.make ? { make: input.make } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.year != null ? { year: input.year } : {})
      });
      if (fromFields) return fromFields;
    }
    if (input.text) {
      return resolveVehicleFromText(input.text, input.year);
    }
    return null;
  }

  searchModels(query: string, limit = 20) {
    return searchVehicleModels(query, limit);
  }

  async findCompatible(input: {
    tenantId: string;
    vehicle: ResolvedVehicle;
    partType?: string;
  }): Promise<VehicleFitmentResult> {
    const fitments = filterFitments(input.vehicle.fitments, input.partType);
    const products = await prisma.tenantCatalogProduct.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      select: {
        id: true,
        sku: true,
        name: true,
        price: true,
        currency: true,
        category: true,
        tags: true,
        isActive: true
      }
    });

    const mapped = await prisma.catalogProductFitment.findMany({
      where: { product: { tenantId: input.tenantId, isActive: true } },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            currency: true,
            category: true,
            isActive: true
          }
        }
      }
    });

    const compatible: CompatibleCatalogProduct[] = [];
    const usedIds = new Set<string>();

    for (const fitment of fitments) {
      const wantedSkus = new Set(fitmentSkus(fitment));

      for (const product of products) {
        const sku = product.sku?.toUpperCase() ?? "";
        const inferred = inferPartTypeFromProduct(product);
        const skuHit = sku && wantedSkus.has(sku);
        const typeHit = inferred.includes(fitment.partType) && (fitment.partType.startsWith("oil_") || fitment.partType.startsWith("bulb_"));
        if (!skuHit && !typeHit) continue;
        if (usedIds.has(product.id)) continue;
        usedIds.add(product.id);
        compatible.push({
          id: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          currency: product.currency,
          category: product.category,
          part_type: fitment.partType,
          part_label: PART_TYPE_LABELS[fitment.partType] ?? fitment.partType,
          spec: fitment.spec ?? null,
          notes: fitment.notes ?? null,
          in_stock: product.isActive,
          match: skuHit ? "sku_hint" : "universal"
        });
      }

      for (const row of mapped) {
        if (usedIds.has(row.product.id)) continue;
        const modelHit =
          row.vehicleModelId == null
            ? row.isUniversal && row.partType === fitment.partType
            : row.partType === fitment.partType;
        if (!modelHit) continue;
        usedIds.add(row.product.id);
        compatible.push({
          id: row.product.id,
          sku: row.product.sku,
          name: row.product.name,
          price: row.product.price,
          currency: row.product.currency,
          category: row.product.category,
          part_type: fitment.partType,
          part_label: PART_TYPE_LABELS[fitment.partType] ?? fitment.partType,
          spec: fitment.spec ?? null,
          notes: row.notes ?? fitment.notes ?? null,
          in_stock: row.product.isActive,
          match: "mapped"
        });
      }
    }

    const covered = new Set(compatible.map((item) => item.part_type));
    const missing = fitments
      .filter((fitment) => !covered.has(fitment.partType))
      .map((fitment) => ({
        part_type: fitment.partType,
        part_label: PART_TYPE_LABELS[fitment.partType] ?? fitment.partType,
        notes: fitment.notes ?? fitment.spec ?? null
      }));

    return {
      vehicle: input.vehicle,
      requested_part_types: fitments.map((item) => item.partType),
      compatible,
      missing
    };
  }

  formatContext(result: VehicleFitmentResult): string {
    const vehicle = result.vehicle;
    const yearLabel =
      vehicle.year != null
        ? String(vehicle.year)
        : `${vehicle.yearFrom}${vehicle.yearTo ? `-${vehicle.yearTo}` : ""}`;
    const lines = [
      `Vehículo: ${vehicle.makeName} ${vehicle.name} ${yearLabel}${vehicle.engine ? ` (${vehicle.engine})` : ""}.`,
      "Fuente: base de fitment beta EasyComp (año/marca/modelo, no VIN). Confirmar motor si hay duda."
    ];
    if (vehicle.notes) lines.push(`Nota: ${vehicle.notes}`);

    if (result.compatible.length) {
      lines.push("Repuestos compatibles en stock del negocio:");
      for (const product of result.compatible.slice(0, 12)) {
        const price =
          product.price != null ? `$${Math.round(product.price).toLocaleString("es-CL")}` : "precio a confirmar";
        lines.push(
          `- ${product.part_label}: ${product.name} (${product.sku ?? "s/SKU"}) ${price}${product.spec ? ` · ${product.spec}` : ""}`
        );
      }
    } else {
      lines.push("No hay SKUs de este negocio contrastados para ese modelo en la base beta.");
    }

    if (result.missing.length) {
      lines.push("Sin match de stock para:");
      for (const item of result.missing.slice(0, 8)) {
        lines.push(`- ${item.part_label}${item.notes ? ` (${item.notes})` : ""}`);
      }
    }

    return lines.join("\n");
  }
}

export const vehicleFitmentService = new VehicleFitmentService();
