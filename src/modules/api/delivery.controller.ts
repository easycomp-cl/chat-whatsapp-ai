import type { Request, Response } from "express";
import { z } from "zod";
import { CHILE_REGION_NAMES } from "../delivery/chile-regions.js";
import { deliveryService, serializeRegion } from "../delivery/delivery.service.js";

function paramId(req: Request, key: string): string {
  const value = req.params[key];
  if (!value || Array.isArray(value)) {
    throw new Error(`Missing param ${key}`);
  }
  return value;
}

const regionSchema = z.object({
  name: z.string().min(1),
  courier: z.string().min(1),
  default_price: z.number().int().min(0),
  active: z.boolean().optional(),
  seed_communes: z.boolean().optional()
});

const regionPatchSchema = z.object({
  name: z.string().min(1).optional(),
  courier: z.string().min(1).optional(),
  default_price: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

const communeSchema = z.object({
  name: z.string().min(1),
  price_override: z.number().int().min(0).nullable().optional(),
  active: z.boolean().optional()
});

const communePatchSchema = z.object({
  name: z.string().min(1).optional(),
  price_override: z.number().int().min(0).nullable().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional()
});

export async function listDeliveryRegions(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const regions = await deliveryService.listRegions(businessId);
  res.json(regions.map(serializeRegion));
}

export async function listChileRegions(_req: Request, res: Response) {
  res.json(CHILE_REGION_NAMES);
}

export async function createDeliveryRegion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const body = regionSchema.parse(req.body);
  const region = await deliveryService.createRegion(businessId, {
    name: body.name,
    courier: body.courier,
    default_price: body.default_price,
    ...(body.active !== undefined ? { active: body.active } : {}),
    ...(body.seed_communes !== undefined ? { seed_communes: body.seed_communes } : {})
  });
  res.status(201).json(serializeRegion(region));
}

export async function patchDeliveryRegion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const regionId = paramId(req, "id");
  const body = regionPatchSchema.parse(req.body);
  const region = await deliveryService.patchRegion(businessId, regionId, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.courier !== undefined ? { courier: body.courier } : {}),
    ...(body.default_price !== undefined ? { default_price: body.default_price } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
    ...(body.sort_order !== undefined ? { sort_order: body.sort_order } : {})
  });
  res.json(serializeRegion(region));
}

export async function deleteDeliveryRegion(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const regionId = paramId(req, "id");
  await deliveryService.deleteRegion(businessId, regionId);
  res.status(204).send();
}

export async function createDeliveryCommune(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const regionId = paramId(req, "regionId");
  const body = communeSchema.parse(req.body);
  const region = await deliveryService.createCommune(businessId, regionId, {
    name: body.name,
    ...(body.price_override !== undefined ? { price_override: body.price_override } : {}),
    ...(body.active !== undefined ? { active: body.active } : {})
  });
  res.status(201).json(serializeRegion(region));
}

export async function patchDeliveryCommune(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const regionId = paramId(req, "regionId");
  const communeId = paramId(req, "communeId");
  const body = communePatchSchema.parse(req.body);
  const region = await deliveryService.patchCommune(
    businessId,
    regionId,
    communeId,
    {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.price_override !== undefined ? { price_override: body.price_override } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.sort_order !== undefined ? { sort_order: body.sort_order } : {})
    }
  );
  res.json(serializeRegion(region));
}

export async function deleteDeliveryCommune(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const regionId = paramId(req, "regionId");
  const communeId = paramId(req, "communeId");
  const region = await deliveryService.deleteCommune(
    businessId,
    regionId,
    communeId
  );
  res.json(serializeRegion(region));
}

export async function seedDeliveryCommunes(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const regionId = paramId(req, "regionId");
  const result = await deliveryService.seedCommunes(businessId, regionId);
  res.json({
    seeded: result.seeded,
    region: serializeRegion(result.region)
  });
}

export async function rebuildDeliveryIndex(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const doc = await deliveryService.rebuildDeliveryDocument(businessId);
  res.json(doc);
}
