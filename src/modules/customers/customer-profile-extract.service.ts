import type { CustomerProfilePatch } from "./customer-profile.service.js";
import { patchCustomerProfile } from "./customer-profile.service.js";
import { prisma } from "../../lib/prisma.js";
import { isValidChileanRut, normalizeRutStorage } from "../../utils/chilean-rut.js";
import { extractChileanPlates } from "../../utils/chilean-plate.js";
import { systemEventService } from "../conversations/system-event.service.js";
import { buildSystemEvent, describeProfileEventFields } from "../conversations/system-event-copy.js";
import { extractVehicleVins } from "../vehicles/vehicle-vin.client.js";
import {
  readCustomerGarage,
  upsertGarageVehicle,
  writeCustomerGarage
} from "./customer-garage.js";

const NAME_STOPWORDS = new Set([
  "hola",
  "buenas",
  "buenos",
  "dias",
  "días",
  "tardes",
  "noches",
  "gracias",
  "quiero",
  "necesito",
  "cotizar",
  "filtro",
  "aceite",
  "repuesto",
  "auto",
  "vehiculo",
  "vehículo",
  "patente",
  "cliente",
  "dueño",
  "dueno",
  "yo",
  "el",
  "la",
  "un",
  "una",
  "de",
  "del"
]);

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const RUT_RE = /\b(?:rut\s*(?:es|:)?\s*)?(\d{1,2}\.?\d{3}\.?\d{3}\s*-?\s*[\dkK])\b/i;

function titleCaseName(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isPlausiblePersonName(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 3) return false;
  return parts.every((part) => {
    const normalized = part
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    if (normalized.length < 2 || normalized.length > 20) return false;
    if (NAME_STOPWORDS.has(part.toLowerCase()) || NAME_STOPWORDS.has(normalized)) return false;
    return /^[a-záéíóúñü']+$/i.test(part);
  });
}

export type ExtractedCustomerFacts = {
  display_alias?: string;
  first_name?: string;
  last_name?: string;
  tax_id?: string;
  email?: string;
  delivery1_line1?: string;
  delivery1_commune?: string;
  vehicle_plates?: string[];
  vins?: string[];
};

export function extractCustomerFactsFromText(text: string): ExtractedCustomerFacts {
  const facts: ExtractedCustomerFacts = {};
  const trimmed = text.trim();
  if (!trimmed) return facts;

  const email = trimmed.match(EMAIL_RE)?.[0];
  if (email) facts.email = email.toLowerCase();

  const rutMatch = trimmed.match(RUT_RE);
  if (rutMatch?.[1] && isValidChileanRut(rutMatch[1])) {
    facts.tax_id = normalizeRutStorage(rutMatch[1]);
  }

  const plates = extractChileanPlates(trimmed);
  if (plates.length) facts.vehicle_plates = plates;
  const vins = extractVehicleVins(trimmed);
  if (vins.length) facts.vins = vins;

  const nameMatch = trimmed.match(
    /(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñü']+(?:\s+[a-záéíóúñü']+){0,2})/i
  );
  if (nameMatch?.[1] && isPlausiblePersonName(nameMatch[1])) {
    const full = titleCaseName(nameMatch[1]);
    const parts = full.split(" ").filter(Boolean);
    facts.display_alias = full;
    if (parts[0]) facts.first_name = parts[0];
    if (parts.length >= 2) facts.last_name = parts.slice(1).join(" ");
  }

  const addressMatch = trimmed.match(
    /(?:vivo en|mi direcci[oó]n(?: es)?|despacho(?: a)?|enviar a)\s+([^.\n]{6,80})/i
  );
  if (addressMatch?.[1]) {
    const raw = addressMatch[1].replace(/\s+/g, " ").trim();
    const pieces = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (pieces[0]) facts.delivery1_line1 = pieces[0];
    if (pieces[1]) facts.delivery1_commune = pieces[1];
  }

  return facts;
}

export class CustomerProfileExtractService {
  async ingestInbound(input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    customerPhone: string;
    text: string;
  }): Promise<{ saved: boolean; fields: string[] }> {
    const facts = extractCustomerFactsFromText(input.text);
    const fieldKeys = Object.keys(facts) as Array<keyof ExtractedCustomerFacts>;
    if (fieldKeys.length === 0) {
      return { saved: false, fields: [] };
    }

    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId }
    });
    if (!customer) {
      return { saved: false, fields: [] };
    }

    let garage = readCustomerGarage(customer.profileMetadata);
    const patch: CustomerProfilePatch = { profile_updated_by: "BOT" };
    const changed: string[] = [];
    const values: Record<string, string> = {};

    if (facts.display_alias) {
      const existing = customer.displayAlias?.trim() ?? "";
      if (!existing || facts.display_alias.length > existing.length) {
        patch.display_alias = facts.display_alias;
        changed.push("display_alias");
        values.display_alias = facts.display_alias;
      }
    }
    if (facts.first_name && (!garage.first_name || facts.first_name.length >= garage.first_name.length)) {
      garage = { ...garage, first_name: facts.first_name };
      changed.push("first_name");
      values.first_name = facts.first_name;
    }
    if (facts.last_name && !garage.last_name) {
      garage = { ...garage, last_name: facts.last_name };
      changed.push("last_name");
      values.last_name = facts.last_name;
    }
    if (facts.tax_id && !customer.taxId?.trim()) {
      patch.tax_id = facts.tax_id;
      changed.push("tax_id");
      values.tax_id = facts.tax_id;
    }
    if (facts.email && !customer.email?.trim()) {
      patch.email = facts.email;
      changed.push("email");
      values.email = facts.email;
    }
    if (facts.delivery1_line1 && !customer.delivery1Line1?.trim()) {
      patch.delivery1_line1 = facts.delivery1_line1;
      changed.push("delivery1_line1");
      values.delivery1_line1 = facts.delivery1_line1;
    }
    if (facts.delivery1_commune && !customer.delivery1Commune?.trim()) {
      patch.delivery1_commune = facts.delivery1_commune;
      changed.push("delivery1_commune");
      values.delivery1_commune = facts.delivery1_commune;
    }

    const addedPlates: string[] = [];
    for (const plate of facts.vehicle_plates ?? []) {
      const already = garage.vehicles.some((item) => item.plate === plate);
      garage = upsertGarageVehicle(garage, { plate, source: "conversation" });
      if (!already) addedPlates.push(plate);
    }
    if (addedPlates.length) {
      changed.push("vehicle_plate");
      values.vehicle_plate = addedPlates.join(", ");
    }

    const addedVins: string[] = [];
    for (const vin of facts.vins ?? []) {
      const already = garage.vehicles.some((item) => item.vin === vin);
      garage = upsertGarageVehicle(garage, { vin, source: "conversation" });
      if (!already) addedVins.push(vin);
    }
    if (addedVins.length) {
      changed.push("vin");
      values.vin = addedVins.join(", ");
    }

    if (facts.first_name || facts.last_name || addedPlates.length || addedVins.length) {
      patch.profile_metadata = writeCustomerGarage(customer.profileMetadata, garage);
    }

    const patchKeys = Object.keys(patch).filter((key) => key !== "profile_updated_by");
    if (patchKeys.length === 0 || changed.length === 0) {
      return { saved: false, fields: [] };
    }

    await patchCustomerProfile({
      tenantId: input.tenantId,
      customerId: input.customerId,
      patch
    });

    await systemEventService.append({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      customerPhone: input.customerPhone,
      event: buildSystemEvent("profile_saved", "BOT", describeProfileEventFields(changed, values), {
        fields: changed,
        values,
        source: "inbound_extract"
      })
    });

    return { saved: true, fields: changed };
  }
}

export const customerProfileExtractService = new CustomerProfileExtractService();
