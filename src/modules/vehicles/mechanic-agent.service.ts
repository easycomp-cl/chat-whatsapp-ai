import { prisma } from "../../lib/prisma.js";
import { extractChileanPlates } from "../../utils/chilean-plate.js";
import { patchCustomerProfile } from "../customers/customer-profile.service.js";
import {
  readCustomerGarage,
  upsertGarageProduct,
  upsertGarageVehicle,
  writeCustomerGarage
} from "../customers/customer-garage.js";
import { systemEventService } from "../conversations/system-event.service.js";
import { buildSystemEvent, formatVehicleCardBody, vehicleCardHasData } from "../conversations/system-event-copy.js";
import type { SystemEventActor } from "../conversations/system-event.types.js";
import { vehicleFitmentService, type VehicleFitmentResult } from "./vehicle-fitment.service.js";
import { vehiclePlateService, type PlateLookupResult } from "./vehicle-plate.service.js";
import { extractVehicleVins, vehicleVinClient } from "./vehicle-vin.client.js";
import { resolveVehiclesFromText, type ResolvedVehicle } from "./vehicle-catalog.js";

const VEHICLE_HINT_RE =
  /\b(patente|vehiculo|vehículo|auto|camioneta|hilux|yaris|corolla|accent|tucson|morning|ranger|l200|amarok|filtro|pastillas|buj[ií]a|ampolleta|escobilla|aceite de motor|repuesto|modelo|compatibl)/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function looksLikeVehicleQuery(text: string): boolean {
  return VEHICLE_HINT_RE.test(text) || extractChileanPlates(text).length > 0;
}

export function isMechanicAgentEnabled(configJson: unknown): boolean {
  const record = asRecord(configJson);
  const nested = asRecord(record.mechanic_agent);
  if (record.mechanic_agent_enabled === false || nested.enabled === false) {
    return false;
  }
  return true;
}

function vehicleLabel(vehicle: ResolvedVehicle): string {
  const year =
    vehicle.year != null
      ? String(vehicle.year)
      : `${vehicle.yearFrom}${vehicle.yearTo ? `-${vehicle.yearTo}` : ""}`;
  return `${vehicle.makeName} ${vehicle.name} ${year}`.trim();
}

function plateSummary(lookup: PlateLookupResult): string {
  const parts = [
    lookup.plate_display,
    lookup.make,
    lookup.model,
    lookup.year ? String(lookup.year) : null
  ].filter(Boolean);
  return parts.join(" · ");
}

export type MechanicAgentResult = {
  used: boolean;
  context: string;
  plate: PlateLookupResult | null;
  vehicle: ResolvedVehicle | null;
  fitment: VehicleFitmentResult | null;
};

export class MechanicAgentService {
  async observeInbound(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    customerPhone: string;
    text: string;
    configJson?: unknown;
    actor?: SystemEventActor;
  }): Promise<void> {
    if (!isMechanicAgentEnabled(input.configJson)) return;
    const plates = extractChileanPlates(input.text);
    const vins = extractVehicleVins(input.text);
    if (!looksLikeVehicleQuery(input.text) && plates.length === 0 && vins.length === 0) {
      return;
    }

    for (const plate of plates) {
      const lookup = await vehiclePlateService.lookup(plate);
      await this.persistVehicleFromLookup({
        tenantId: input.tenantId,
        customerId: input.customerId,
        lookup
      });
      const card = {
        plate: lookup.plate,
        plate_display: lookup.plate_display,
        make: lookup.make,
        model: lookup.model,
        year: lookup.year,
        engine: lookup.engine,
        vehicle_type: lookup.vehicle_type,
        color: lookup.color,
        vin: lookup.vin,
        fuel: lookup.fuel,
        version: lookup.version,
        transmission: lookup.transmission,
        status: lookup.status
      };
      const found = vehicleCardHasData(card);
      await systemEventService.append({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        customerPhone: input.customerPhone,
        event: buildSystemEvent(
          "plate_lookup",
          input.actor ?? "BOT",
          found ? formatVehicleCardBody(card) : this.plateEventBody(lookup),
          card,
          found ? "dark_card" : "blue_pill"
        )
      });
    }

    for (const vin of vins) {
      const decoded = await vehicleVinClient.decode(vin);
      if (!decoded) continue;
      await this.persistVinVehicle({
        tenantId: input.tenantId,
        customerId: input.customerId,
        decoded
      });
      await systemEventService.append({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        customerPhone: input.customerPhone,
        event: buildSystemEvent(
          "vehicle_identified",
          input.actor ?? "BOT",
          [decoded.vin, decoded.make, decoded.model, decoded.year].filter(Boolean).join(" · "),
          {
            vin: decoded.vin,
            make: decoded.make,
            model: decoded.model,
            year: decoded.year,
            source: "vin"
          }
        )
      });
    }

    const vehicles = resolveVehiclesFromText(input.text);
    for (const vehicle of vehicles) {
      await this.persistResolvedVehicle({
        tenantId: input.tenantId,
        customerId: input.customerId,
        vehicle
      });
      await systemEventService.append({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        customerPhone: input.customerPhone,
        event: buildSystemEvent(
          "vehicle_identified",
          input.actor ?? "BOT",
          `${vehicleLabel(vehicle)} (base beta)`,
          {
            make: vehicle.makeName,
            model: vehicle.name,
            year: vehicle.year ?? null,
            year_from: vehicle.yearFrom,
            year_to: vehicle.yearTo ?? null
          }
        )
      });
    }
  }

  async buildContext(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    customerPhone: string;
    text: string;
    configJson?: unknown;
    emitEvents?: boolean;
    actor?: SystemEventActor;
  }): Promise<MechanicAgentResult> {
    if (!isMechanicAgentEnabled(input.configJson)) {
      return { used: false, context: "", plate: null, vehicle: null, fitment: null };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId },
      select: { profileMetadata: true }
    });
    const garage = readCustomerGarage(customer?.profileMetadata);
    const plates = extractChileanPlates(input.text);
    const mentioned = resolveVehiclesFromText(input.text);
    const plateToUse = plates[0] ?? garage.vehicles.find((item) => item.key === garage.active_vehicle_key)?.plate ?? garage.vehicles[0]?.plate ?? null;

    let plate: PlateLookupResult | null = null;
    if (plateToUse) {
      plate = await vehiclePlateService.lookup(plateToUse);
    }

    const vehicle =
      mentioned[0] ??
      plate?.vehicle ??
      vehicleFitmentService.resolveVehicle({
        text: input.text,
        ...(plate?.make ? { make: plate.make } : {}),
        ...(plate?.model ? { model: plate.model } : {}),
        ...(plate?.year != null ? { year: plate.year } : {})
      });

    if (!vehicle && !looksLikeVehicleQuery(input.text) && !plate && garage.vehicles.length === 0) {
      return { used: false, context: "", plate, vehicle: null, fitment: null };
    }

    let fitment: VehicleFitmentResult | null = null;
    if (vehicle) {
      fitment = await vehicleFitmentService.findCompatible({
        tenantId: input.tenantId,
        vehicle
      });
    }

    const contextParts: string[] = [];
    if (garage.vehicles.length > 1) {
      contextParts.push(
        `El cliente tiene ${garage.vehicles.length} vehículos guardados: ` +
          garage.vehicles
            .map((item) => [item.make, item.model, item.year, item.plate].filter(Boolean).join(" "))
            .join(" | ")
      );
      contextParts.push("Usa el vehículo activo o el mencionado en el mensaje actual. No mezcles repuestos entre autos.");
    }
    if (plate) {
      contextParts.push(`Patente ${plate.plate_display}: ${this.plateEventBody(plate)}`);
    }
    if (mentioned.length > 1) {
      contextParts.push(
        `Este mensaje menciona varios modelos: ${mentioned.map((item) => vehicleLabel(item)).join(" | ")}.`
      );
    }
    if (fitment) {
      contextParts.push(vehicleFitmentService.formatContext(fitment));
    } else if (vehicle) {
      contextParts.push(`Vehículo identificado: ${vehicleLabel(vehicle)}. Sin contrastar stock todavía.`);
    } else if (looksLikeVehicleQuery(input.text)) {
      contextParts.push(
        "El cliente habla de un vehículo o repuesto, pero falta marca/modelo/año o patente para confirmar fitment. No inventar compatibilidad."
      );
    }

    if (fitment && fitment.compatible.length > 0) {
      await this.recordConsultedProducts({
        tenantId: input.tenantId,
        customerId: input.customerId,
        fitment
      });
      if (input.emitEvents) {
        const preview = fitment.compatible
          .slice(0, 4)
          .map((item) => `${item.part_label}: ${item.sku ?? item.name}`)
          .join("; ");
        await systemEventService.append({
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          customerId: input.customerId,
          customerPhone: input.customerPhone,
          event: buildSystemEvent(
            "recommendation",
            input.actor ?? "BOT",
            `${vehicleLabel(fitment.vehicle)} → ${preview}`,
            {
              product_ids: fitment.compatible.map((item) => item.id),
              missing: fitment.missing.map((item) => item.part_type)
            }
          )
        });
      }
    }

    return {
      used: contextParts.length > 0,
      context: contextParts.join("\n"),
      plate,
      vehicle,
      fitment
    };
  }

  private plateEventBody(lookup: PlateLookupResult): string {
    if (lookup.status === "invalid_plate") return "Patente con formato inválido.";
    if (lookup.status === "provider_not_configured") {
      return `${lookup.plate_display}: API de patentes no configurada. Pedir marca, modelo y año.`;
    }
    if (lookup.status === "not_found") {
      return `${lookup.plate_display}: el proveedor no devolvió datos.`;
    }
    return plateSummary(lookup);
  }

  private async persistVehicleFromLookup(input: {
    tenantId: string;
    customerId: string;
    lookup: PlateLookupResult;
  }) {
    if (input.lookup.status === "invalid_plate") return;
    await this.mergeGarage(input.tenantId, input.customerId, (garage) =>
      upsertGarageVehicle(garage, {
        plate: input.lookup.plate,
        ...(input.lookup.make ? { make: input.lookup.make } : {}),
        ...(input.lookup.model ? { model: input.lookup.model } : {}),
        ...(input.lookup.year != null ? { year: input.lookup.year } : {}),
        ...(input.lookup.engine ? { engine: input.lookup.engine } : {}),
        ...(input.lookup.color ? { color: input.lookup.color } : {}),
        ...(input.lookup.vin ? { vin: input.lookup.vin } : {}),
        ...(input.lookup.fuel ? { fuel: input.lookup.fuel } : {}),
        ...(input.lookup.version ? { version: input.lookup.version } : {}),
        source: "plate_lookup"
      })
    );
  }

  private async persistVinVehicle(input: {
    tenantId: string;
    customerId: string;
    decoded: Awaited<ReturnType<typeof vehicleVinClient.decode>>;
  }) {
    const decoded = input.decoded;
    if (!decoded) return;
    await this.mergeGarage(input.tenantId, input.customerId, (garage) =>
      upsertGarageVehicle(garage, {
        vin: decoded.vin,
        ...(decoded.make ? { make: decoded.make } : {}),
        ...(decoded.model ? { model: decoded.model } : {}),
        ...(decoded.year != null ? { year: decoded.year } : {}),
        ...(decoded.engine ? { engine: decoded.engine } : {}),
        source: "nhtsa_vpic"
      })
    );
  }

  private async persistResolvedVehicle(input: {
    tenantId: string;
    customerId: string;
    vehicle: ResolvedVehicle;
  }) {
    await this.mergeGarage(input.tenantId, input.customerId, (garage) =>
      upsertGarageVehicle(garage, {
        make: input.vehicle.makeName,
        model: input.vehicle.name,
        ...(input.vehicle.year != null ? { year: input.vehicle.year } : {}),
        year_from: input.vehicle.yearFrom,
        ...(input.vehicle.yearTo != null ? { year_to: input.vehicle.yearTo } : {}),
        ...(input.vehicle.engine ? { engine: input.vehicle.engine } : {}),
        source: "conversation"
      })
    );
  }

  private async recordConsultedProducts(input: {
    tenantId: string;
    customerId: string;
    fitment: VehicleFitmentResult;
  }) {
    await this.mergeGarage(input.tenantId, input.customerId, (garage) => {
      let next = garage;
      for (const product of input.fitment.compatible.slice(0, 8)) {
        next = {
          ...next,
          products_consulted: upsertGarageProduct(next.products_consulted, {
            product_id: product.id,
            ...(product.sku ? { sku: product.sku } : {}),
            name: product.name,
            source: "recommendation",
            at: new Date().toISOString(),
            ...(next.active_vehicle_key ? { vehicle_key: next.active_vehicle_key } : {})
          })
        };
      }
      return next;
    });
  }

  private async mergeGarage(
    tenantId: string,
    customerId: string,
    mutate: (garage: ReturnType<typeof readCustomerGarage>) => ReturnType<typeof readCustomerGarage>
  ) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { profileMetadata: true }
    });
    if (!customer) return;
    const garage = mutate(readCustomerGarage(customer.profileMetadata));
    await patchCustomerProfile({
      tenantId,
      customerId,
      patch: {
        profile_updated_by: "BOT",
        profile_metadata: writeCustomerGarage(customer.profileMetadata, garage)
      }
    });
  }
}

export const mechanicAgentService = new MechanicAgentService();
