import { formatGarageMemory, readCustomerGarage } from "../customers/customer-garage.js";

const METADATA_LABELS: Record<string, string> = {
  preferred_payment: "Forma de pago preferida",
  payment_method: "Forma de pago preferida",
  allergies: "Alergias",
  allergy: "Alergias",
  frequent_order: "Pedido frecuente",
  favorite_product: "Pedido frecuente",
  usual_order: "Pedido frecuente",
  birthday: "Cumpleaños",
  notes: "Notas",
  last_name: "Apellido",
  active_vehicle_plate: "Patente"
};

type CustomerMemorySource = {
  name?: string | null;
  displayAlias?: string | null;
  email?: string | null;
  taxId?: string | null;
  invoiceType?: string | null;
  companyName?: string | null;
  delivery1Line1?: string | null;
  delivery1Commune?: string | null;
  delivery1Region?: string | null;
  delivery1Notes?: string | null;
  profileMetadata?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function trimOptional(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function invoiceLabel(value: string | null | undefined): string | null {
  if (value === "RECEIPT") return "Boleta";
  if (value === "INVOICE") return "Factura";
  return null;
}

export function formatCustomerMemory(customer: CustomerMemorySource | null | undefined): string {
  if (!customer) return "";

  const lines: string[] = [];
  const displayName = trimOptional(customer.displayAlias) ?? trimOptional(customer.name);
  if (displayName) lines.push(`Nombre: ${displayName}`);
  if (trimOptional(customer.email)) lines.push(`Email: ${customer.email!.trim()}`);
  if (trimOptional(customer.taxId)) lines.push(`RUT: ${customer.taxId!.trim()}`);

  const invoice = invoiceLabel(customer.invoiceType);
  if (invoice) lines.push(`Documento: ${invoice}`);
  if (trimOptional(customer.companyName)) lines.push(`Razón social: ${customer.companyName!.trim()}`);

  const address = [customer.delivery1Line1, customer.delivery1Commune, customer.delivery1Region]
    .map((part) => trimOptional(part))
    .filter((part): part is string => !!part);
  if (address.length) lines.push(`Despacho: ${address.join(", ")}`);
  if (trimOptional(customer.delivery1Notes)) lines.push(`Notas de despacho: ${customer.delivery1Notes!.trim()}`);

  const metadata = asRecord(customer.profileMetadata);
  const garage = readCustomerGarage(metadata);
  if (garage.last_name) lines.push(`Apellido: ${garage.last_name}`);
  const garageMemory = formatGarageMemory(garage);
  if (garageMemory) lines.push(garageMemory);

  for (const [key, raw] of Object.entries(metadata)) {
    if (raw == null || typeof raw === "object") continue;
    if (
      key === "first_name" ||
      key === "last_name" ||
      key === "active_vehicle_plate" ||
      key === "active_vehicle_key"
    ) {
      continue;
    }
    const value = String(raw).trim();
    if (!value) continue;
    const label = METADATA_LABELS[key] ?? key.replace(/_/g, " ");
    lines.push(`${label}: ${value}`);
  }

  return lines.join("\n");
}
