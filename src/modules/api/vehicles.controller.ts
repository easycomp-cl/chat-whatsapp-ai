import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { paramId } from "../../utils/params.js";
import { isValidChileanPlate } from "../../utils/chilean-plate.js";
import { vehiclePlateService } from "../vehicles/vehicle-plate.service.js";
import { vehicleFitmentService } from "../vehicles/vehicle-fitment.service.js";
import { mechanicAgentService } from "../vehicles/mechanic-agent.service.js";

const fitmentQuerySchema = z.object({
  q: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().int().min(1970).max(2100).optional(),
  plate: z.string().optional(),
  part_type: z.string().optional()
});

const lookupBodySchema = z.object({
  plate: z.string().min(4).max(12)
});

const fitmentItemSchema = z.object({
  part_type: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().int().optional(),
  is_universal: z.boolean().optional(),
  notes: z.string().max(400).optional()
});

function serializePlate(result: Awaited<ReturnType<typeof vehiclePlateService.lookup>>) {
  return {
    status: result.status,
    plate: result.plate,
    plate_display: result.plate_display,
    make: result.make,
    model: result.model,
    year: result.year,
    engine: result.engine,
    vehicle_type: result.vehicle_type,
    color: result.color,
    vin: result.vin,
    fuel: result.fuel,
    version: result.version,
    transmission: result.transmission,
    provider: result.provider,
    provider_configured: result.provider_configured,
    vehicle: result.vehicle
      ? {
          make: result.vehicle.makeName,
          model: result.vehicle.name,
          slug: result.vehicle.slug,
          year_from: result.vehicle.yearFrom,
          year_to: result.vehicle.yearTo ?? null,
          engine: result.vehicle.engine ?? null
        }
      : null
  };
}

function serializeVehicle(model: ReturnType<typeof vehicleFitmentService.searchModels>[number]) {
  return {
    make: model.makeName,
    make_slug: model.makeSlug,
    model: model.name,
    slug: model.slug,
    year_from: model.yearFrom,
    year_to: model.yearTo ?? null,
    engine: model.engine ?? null,
    notes: model.notes ?? null
  };
}

export async function lookupVehiclePlate(req: Request, res: Response) {
  const plate = paramId(req, "plate");
  if (!isValidChileanPlate(plate)) {
    res.status(400).json({ error: "Patente inválida", status: "invalid_plate" });
    return;
  }
  const result = await vehiclePlateService.lookup(plate);
  res.json(serializePlate(result));
}

export async function searchVehicleModelsHandler(req: Request, res: Response) {
  const query = fitmentQuerySchema.parse(req.query);
  const models = vehicleFitmentService.searchModels(query.q ?? "", 30).map(serializeVehicle);
  res.json({ models });
}

export async function lookupConversationVehicle(req: Request, res: Response) {
  const conversationId = paramId(req, "id");
  const body = lookupBodySchema.parse(req.body);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true, tenant: { include: { config: true } } }
  });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const result = await vehiclePlateService.lookup(body.plate);
  await mechanicAgentService.observeInbound({
    tenantId: conversation.tenantId,
    conversationId: conversation.id,
    customerId: conversation.customerId,
    customerPhone: conversation.customer.phoneNumber,
    text: `patente ${body.plate}`,
    configJson: conversation.tenant.config?.configJson,
    actor: "HUMAN"
  });
  await mechanicAgentService.buildContext({
    tenantId: conversation.tenantId,
    conversationId: conversation.id,
    customerId: conversation.customerId,
    customerPhone: conversation.customer.phoneNumber,
    text: `patente ${body.plate}`,
    configJson: conversation.tenant.config?.configJson,
    emitEvents: true,
    actor: "HUMAN"
  });

  let fitment = null;
  if (result.vehicle) {
    const found = await vehicleFitmentService.findCompatible({
      tenantId: conversation.tenantId,
      vehicle: result.vehicle
    });
    fitment = {
      compatible: found.compatible,
      missing: found.missing
    };
  }

  res.json({
    ...serializePlate(result),
    fitment
  });
}

export async function listCompatibleCatalogProducts(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const query = fitmentQuerySchema.parse(req.query);

  let vehicle = vehicleFitmentService.resolveVehicle({
    text: [query.make, query.model, query.year].filter(Boolean).join(" "),
    ...(query.make ? { make: query.make } : {}),
    ...(query.model ? { model: query.model } : {}),
    ...(query.year != null ? { year: query.year } : {})
  });

  if (!vehicle && query.plate) {
    const plate = await vehiclePlateService.lookup(query.plate);
    vehicle = plate.vehicle;
  }

  if (!vehicle) {
    res.status(400).json({ error: "Indica patente o marca/modelo/año conocidos en la base beta" });
    return;
  }

  const result = await vehicleFitmentService.findCompatible({
    tenantId: businessId,
    vehicle,
    ...(query.part_type ? { partType: query.part_type } : {})
  });

  res.json({
    vehicle: serializeVehicle(result.vehicle),
    compatible: result.compatible,
    missing: result.missing
  });
}

export async function listProductFitment(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const productId = paramId(req, "productId");
  const product = await prisma.tenantCatalogProduct.findFirst({
    where: { id: productId, tenantId: businessId },
    include: { fitments: true }
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    fitments: product.fitments.map((row) => ({
      id: row.id,
      part_type: row.partType,
      vehicle_model_id: row.vehicleModelId,
      is_universal: row.isUniversal,
      notes: row.notes
    }))
  });
}

export async function upsertProductFitment(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const productId = paramId(req, "productId");
  const body = z.object({ items: z.array(fitmentItemSchema).max(50) }).parse(req.body);

  const product = await prisma.tenantCatalogProduct.findFirst({
    where: { id: productId, tenantId: businessId }
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  await prisma.catalogProductFitment.deleteMany({ where: { tenantCatalogProductId: productId } });

  for (const item of body.items) {
    const vehicle =
      item.make || item.model
        ? vehicleFitmentService.resolveVehicle({
            ...(item.make ? { make: item.make } : {}),
            ...(item.model ? { model: item.model } : {}),
            ...(item.year != null ? { year: item.year } : {})
          })
        : null;
    const dbModel =
      vehicle != null
        ? await prisma.vehicleModel.findFirst({
            where: {
              slug: vehicle.slug,
              make: { slug: vehicle.makeSlug },
              yearFrom: vehicle.yearFrom
            },
            select: { id: true }
          })
        : null;

    await prisma.catalogProductFitment.create({
      data: {
        tenantCatalogProductId: productId,
        partType: item.part_type,
        isUniversal: item.is_universal === true || !dbModel,
        vehicleModelId: dbModel?.id ?? null,
        notes: item.notes ?? null
      }
    });
  }

  const fitments = await prisma.catalogProductFitment.findMany({
    where: { tenantCatalogProductId: productId }
  });
  res.json({
    product_id: productId,
    fitments: fitments.map((row) => ({
      id: row.id,
      part_type: row.partType,
      vehicle_model_id: row.vehicleModelId,
      is_universal: row.isUniversal,
      notes: row.notes
    }))
  });
}
