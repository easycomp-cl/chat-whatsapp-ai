import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

export type PlateProviderResult = {
  makeName: string | null;
  modelName: string | null;
  year: number | null;
  engine: string | null;
  vehicleType: string | null;
  color: string | null;
  vin: string | null;
  fuel: string | null;
  version: string | null;
  transmission: string | null;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asYear(value: unknown): number | null {
  const text = asText(value);
  if (!text) return null;
  const year = Number.parseInt(text.replace(/\D/g, "").slice(0, 4), 10);
  if (year < 1970 || year > new Date().getFullYear() + 1) return null;
  return year;
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] != null) return record[key];
  }
  return null;
}

function omitPrivateFields(record: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "owner",
    "fullname",
    "full_name",
    "documentNumber",
    "document_number",
    "rut",
    "nombre"
  ]);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (blocked.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = omitPrivateFields(value as Record<string, unknown>);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function mapVehicleFields(record: Record<string, unknown>): PlateProviderResult {
  const nested = asRecord(pick(record, ["data", "vehicle", "result"]));
  const source = omitPrivateFields(Object.keys(nested).length ? nested : record);
  return {
    makeName: asText(pick(source, ["make", "marca", "brand", "manufacturer"])),
    modelName: asText(pick(source, ["model", "modelo"])),
    year: asYear(pick(source, ["year", "anio", "ano", "año", "model_year"])),
    engine: asText(pick(source, ["engine", "motor", "cilindrada", "engine_size"])),
    vehicleType: asText(pick(source, ["type", "tipo", "vehicle_type", "tipo_vehiculo"])),
    color: asText(pick(source, ["color", "colour"])),
    vin: asText(pick(source, ["vin", "chasis", "chassis"])),
    fuel: asText(pick(source, ["fuel", "bencina", "fuel_type", "tipo_bencina", "combustible"])),
    version: asText(pick(source, ["version", "version_vehiculo", "trim"])),
    transmission: asText(pick(source, ["transmission", "transmision", "tipo_transmision"])),
    raw: source
  };
}

function buildUrl(plate: string): string | null {
  const template = env.VEHICLE_PLATE_API_URL;
  if (!template) return null;
  if (template.includes("{plate}")) {
    return template.replaceAll("{plate}", encodeURIComponent(plate));
  }
  return `${template.replace(/\/$/, "")}/${encodeURIComponent(plate)}`;
}

export class VehiclePlateClient {
  async lookup(plateNormalized: string): Promise<PlateProviderResult | null> {
    const url = buildUrl(plateNormalized);
    if (!url) {
      return null;
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (env.VEHICLE_PLATE_API_KEY) {
      headers.Authorization = `Bearer ${env.VEHICLE_PLATE_API_KEY}`;
      headers["X-API-Key"] = env.VEHICLE_PLATE_API_KEY;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        logger.warn(
          { status: response.status, plate: plateNormalized },
          "Vehicle plate provider returned non-OK"
        );
        return null;
      }
      const json = (await response.json()) as unknown;
      return mapVehicleFields(asRecord(json));
    } catch (error) {
      logger.warn({ err: error, plate: plateNormalized }, "Vehicle plate provider failed");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  isConfigured(): boolean {
    return Boolean(env.VEHICLE_PLATE_API_URL);
  }
}

export const vehiclePlateClient = new VehiclePlateClient();
