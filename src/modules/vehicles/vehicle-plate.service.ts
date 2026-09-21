import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import {
  formatChileanPlate,
  isValidChileanPlate,
  normalizeChileanPlate
} from "../../utils/chilean-plate.js";
import { findVehicleByMakeModelYear, type ResolvedVehicle } from "./vehicle-catalog.js";
import { vehiclePlateClient } from "./vehicle-plate.client.js";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type PlateLookupStatus =
  | "found"
  | "cached"
  | "invalid_plate"
  | "not_found"
  | "provider_not_configured";

export type PlateLookupResult = {
  status: PlateLookupStatus;
  plate: string;
  plate_display: string;
  make: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  vehicle_type: string | null;
  color: string | null;
  vin: string | null;
  fuel: string | null;
  version: string | null;
  transmission: string | null;
  vehicle: ResolvedVehicle | null;
  provider: string | null;
  provider_configured: boolean;
};

function extrasFromRaw(raw: unknown): {
  vin: string | null;
  fuel: string | null;
  version: string | null;
  transmission: string | null;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { vin: null, fuel: null, version: null, transmission: null };
  }
  const row = raw as Record<string, unknown>;
  const text = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    vin: text(["vin", "chasis", "chassis"]),
    fuel: text(["fuel", "bencina", "fuel_type", "tipo_bencina", "combustible"]),
    version: text(["version", "version_vehiculo", "trim"]),
    transmission: text(["transmission", "transmision", "tipo_transmision"])
  };
}

function emptyResult(
  plate: string,
  status: PlateLookupStatus,
  extra?: Partial<PlateLookupResult>
): PlateLookupResult {
  return {
    status,
    plate,
    plate_display: formatChileanPlate(plate),
    make: null,
    model: null,
    year: null,
    engine: null,
    vehicle_type: null,
    color: null,
    vin: null,
    fuel: null,
    version: null,
    transmission: null,
    vehicle: null,
    provider: null,
    provider_configured: vehiclePlateClient.isConfigured(),
    ...extra
  };
}

export class VehiclePlateService {
  async lookup(rawPlate: string): Promise<PlateLookupResult> {
    if (!isValidChileanPlate(rawPlate)) {
      return emptyResult(normalizeChileanPlate(rawPlate), "invalid_plate");
    }

    const plate = normalizeChileanPlate(rawPlate);
    const now = new Date();
    const cached = await prisma.vehiclePlateLookup.findUnique({
      where: { plateNormalized: plate }
    });

    if (cached && cached.expiresAt > now) {
      const extras = extrasFromRaw(cached.rawJson);
      const vehicle = findVehicleByMakeModelYear({
        ...(cached.makeName ? { make: cached.makeName } : {}),
        ...(cached.modelName ? { model: cached.modelName } : {}),
        ...(cached.year != null ? { year: cached.year } : {})
      });
      return {
        status: "cached",
        plate,
        plate_display: formatChileanPlate(plate),
        make: cached.makeName,
        model: cached.modelName,
        year: cached.year,
        engine: cached.engine,
        vehicle_type: cached.vehicleType,
        color: cached.color,
        vin: extras.vin,
        fuel: extras.fuel,
        version: extras.version,
        transmission: extras.transmission,
        vehicle,
        provider: cached.provider,
        provider_configured: vehiclePlateClient.isConfigured()
      };
    }

    if (!vehiclePlateClient.isConfigured()) {
      if (cached) {
        const extras = extrasFromRaw(cached.rawJson);
        return {
          status: "cached",
          plate,
          plate_display: formatChileanPlate(plate),
          make: cached.makeName,
          model: cached.modelName,
          year: cached.year,
          engine: cached.engine,
          vehicle_type: cached.vehicleType,
          color: cached.color,
          vin: extras.vin,
          fuel: extras.fuel,
          version: extras.version,
          transmission: extras.transmission,
          vehicle: findVehicleByMakeModelYear({
            ...(cached.makeName ? { make: cached.makeName } : {}),
            ...(cached.modelName ? { model: cached.modelName } : {}),
            ...(cached.year != null ? { year: cached.year } : {})
          }),
          provider: cached.provider,
          provider_configured: false
        };
      }
      return emptyResult(plate, "provider_not_configured");
    }

    const remote = await vehiclePlateClient.lookup(plate);
    if (!remote || (!remote.makeName && !remote.modelName)) {
      logger.info({ plate }, "Vehicle plate lookup returned no make/model");
      return emptyResult(plate, "not_found", { provider: "remote" });
    }

    const vehicle = findVehicleByMakeModelYear({
      ...(remote.makeName ? { make: remote.makeName } : {}),
      ...(remote.modelName ? { model: remote.modelName } : {}),
      ...(remote.year != null ? { year: remote.year } : {})
    });

    await prisma.vehiclePlateLookup.upsert({
      where: { plateNormalized: plate },
      create: {
        plateNormalized: plate,
        makeName: remote.makeName,
        modelName: remote.modelName,
        year: remote.year,
        engine: remote.engine,
        vehicleType: remote.vehicleType,
        color: remote.color,
        vehicleModelId: null,
        provider: "remote",
        rawJson: remote.raw as Prisma.InputJsonValue,
        lookedUpAt: now,
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS)
      },
      update: {
        makeName: remote.makeName,
        modelName: remote.modelName,
        year: remote.year,
        engine: remote.engine,
        vehicleType: remote.vehicleType,
        color: remote.color,
        provider: "remote",
        rawJson: remote.raw as Prisma.InputJsonValue,
        lookedUpAt: now,
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS)
      }
    });

    return {
      status: "found",
      plate,
      plate_display: formatChileanPlate(plate),
      make: remote.makeName,
      model: remote.modelName,
      year: remote.year,
      engine: remote.engine,
      vehicle_type: remote.vehicleType,
      color: remote.color,
      vin: remote.vin,
      fuel: remote.fuel,
      version: remote.version,
      transmission: remote.transmission,
      vehicle,
      provider: "remote",
      provider_configured: true
    };
  }
}

export const vehiclePlateService = new VehiclePlateService();
