import { logger } from "../../lib/logger.js";
import { findVehicleByMakeModelYear, type ResolvedVehicle } from "./vehicle-catalog.js";

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

export function extractVehicleVins(text: string): string[] {
  const matches = text.toUpperCase().match(VIN_RE) ?? [];
  return [...new Set(matches)];
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length && trimmed !== "Not Applicable" ? trimmed : null;
}

export type VinDecodeResult = {
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  vehicle: ResolvedVehicle | null;
  provider: "nhtsa_vpic";
};

export class VehicleVinClient {
  async decode(vin: string): Promise<VinDecodeResult | null> {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const json = (await response.json()) as { Results?: Array<Record<string, unknown>> };
      const row = json.Results?.[0] ?? {};
      const make = asText(row.Make);
      const model = asText(row.Model);
      const yearRaw = asText(row.ModelYear);
      const year = yearRaw ? Number.parseInt(yearRaw, 10) : null;
      const engine = asText(row.DisplacementL) ?? asText(row.EngineModel);
      const vehicle = findVehicleByMakeModelYear({
        ...(make ? { make } : {}),
        ...(model ? { model } : {}),
        ...(year && Number.isFinite(year) ? { year } : {})
      });
      return {
        vin,
        make,
        model,
        year: year && Number.isFinite(year) ? year : null,
        engine,
        vehicle,
        provider: "nhtsa_vpic"
      };
    } catch (error) {
      logger.warn({ err: error, vin }, "NHTSA vPIC VIN decode failed");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const vehicleVinClient = new VehicleVinClient();
