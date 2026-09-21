export type StoredVehicle = {
  key: string;
  plate?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  year_from?: number;
  year_to?: number;
  engine?: string;
  color?: string;
  fuel?: string;
  version?: string;
  source: string;
  last_seen_at: string;
};

export type StoredProductEvent = {
  product_id?: string;
  sku?: string;
  name: string;
  quantity?: number;
  vehicle_key?: string;
  source: "chat" | "quote" | "recommendation" | "purchase";
  at: string;
};

export type CustomerGarage = {
  first_name: string | null;
  last_name: string | null;
  vehicles: StoredVehicle[];
  active_vehicle_key: string | null;
  products_consulted: StoredProductEvent[];
  products_quoted: StoredProductEvent[];
  products_purchased: StoredProductEvent[];
};

const VEHICLE_CAP = 20;
const PRODUCT_CAP = 40;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function asYear(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{4}$/.test(value)) return Number(value);
  return undefined;
}

export function vehicleGarageKey(input: {
  plate?: string | null | undefined;
  vin?: string | null | undefined;
  make?: string | null | undefined;
  model?: string | null | undefined;
  year?: number | null | undefined;
}): string {
  if (input.plate) return `plate:${input.plate}`;
  if (input.vin) return `vin:${input.vin}`;
  const make = (input.make ?? "").toLowerCase().replace(/\s+/g, "-");
  const model = (input.model ?? "").toLowerCase().replace(/\s+/g, "-");
  const year = input.year != null ? String(input.year) : "x";
  return `model:${make}:${model}:${year}`;
}

function parseVehicle(raw: unknown): StoredVehicle | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const plate = asText(row.plate);
  const vin = asText(row.vin);
  const make = asText(row.make);
  const model = asText(row.model);
  if (!plate && !vin && !make && !model) return null;
  const year = asYear(row.year);
  const key =
    asText(row.key) ??
    vehicleGarageKey({
      plate,
      vin,
      make,
      model,
      year
    });
  const yearFrom = asYear(row.year_from);
  const yearTo = asYear(row.year_to);
  const engine = asText(row.engine);
  const color = asText(row.color);
  const fuel = asText(row.fuel);
  const version = asText(row.version);
  const item: StoredVehicle = {
    key,
    source: asText(row.source) ?? "conversation",
    last_seen_at: asText(row.last_seen_at) ?? new Date().toISOString()
  };
  if (plate) item.plate = plate;
  if (vin) item.vin = vin;
  if (make) item.make = make;
  if (model) item.model = model;
  if (year != null) item.year = year;
  if (yearFrom != null) item.year_from = yearFrom;
  if (yearTo != null) item.year_to = yearTo;
  if (engine) item.engine = engine;
  if (color) item.color = color;
  if (fuel) item.fuel = fuel;
  if (version) item.version = version;
  return item;
}

function parseProduct(raw: unknown): StoredProductEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const name = asText(row.name);
  if (!name) return null;
  const source = row.source;
  const allowed = ["chat", "quote", "recommendation", "purchase"] as const;
  const productId = asText(row.product_id);
  const sku = asText(row.sku);
  const vehicleKey = asText(row.vehicle_key);
  const item: StoredProductEvent = {
    name,
    source: allowed.includes(source as (typeof allowed)[number])
      ? (source as StoredProductEvent["source"])
      : "chat",
    at: asText(row.at) ?? new Date().toISOString()
  };
  if (productId) item.product_id = productId;
  if (sku) item.sku = sku;
  if (typeof row.quantity === "number") item.quantity = row.quantity;
  if (vehicleKey) item.vehicle_key = vehicleKey;
  return item;
}

export function readCustomerGarage(metadata: unknown): CustomerGarage {
  const record = asRecord(metadata);
  const vehicles = Array.isArray(record.vehicles)
    ? record.vehicles.map(parseVehicle).filter((item): item is StoredVehicle => item != null)
    : [];
  const legacy = parseVehicle(record.active_vehicle);
  const activePlate = asText(record.active_vehicle_plate);
  if (legacy && !vehicles.some((item) => item.key === legacy.key || (legacy.model && item.model === legacy.model))) {
    if (activePlate && !legacy.plate) legacy.plate = activePlate;
    vehicles.unshift(legacy);
  }
  if (activePlate && !vehicles.some((item) => item.plate === activePlate)) {
    if (vehicles[0] && !vehicles[0].plate) {
      vehicles[0] = { ...vehicles[0], plate: activePlate };
    } else {
      vehicles.unshift({
        key: vehicleGarageKey({ plate: activePlate }),
        plate: activePlate,
        source: "conversation",
        last_seen_at: new Date().toISOString()
      });
    }
  }

  return {
    first_name: asText(record.first_name) ?? null,
    last_name: asText(record.last_name) ?? null,
    vehicles: vehicles.slice(0, VEHICLE_CAP),
    active_vehicle_key:
      asText(record.active_vehicle_key) ??
      (activePlate ? vehicleGarageKey({ plate: activePlate }) : vehicles[0]?.key ?? null),
    products_consulted: Array.isArray(record.products_consulted)
      ? record.products_consulted
          .map(parseProduct)
          .filter((item): item is StoredProductEvent => item != null)
          .slice(0, PRODUCT_CAP)
      : [],
    products_quoted: Array.isArray(record.products_quoted)
      ? record.products_quoted
          .map(parseProduct)
          .filter((item): item is StoredProductEvent => item != null)
          .slice(0, PRODUCT_CAP)
      : [],
    products_purchased: Array.isArray(record.products_purchased)
      ? record.products_purchased
          .map(parseProduct)
          .filter((item): item is StoredProductEvent => item != null)
          .slice(0, PRODUCT_CAP)
      : []
  };
}

export function upsertGarageVehicle(
  garage: CustomerGarage,
  incoming: Omit<StoredVehicle, "key" | "last_seen_at"> & { key?: string; last_seen_at?: string }
): CustomerGarage {
  const key =
    incoming.key ??
    vehicleGarageKey({
      plate: incoming.plate,
      vin: incoming.vin,
      make: incoming.make,
      model: incoming.model,
      year: incoming.year
    });
  const next: StoredVehicle = {
    ...incoming,
    key,
    last_seen_at: incoming.last_seen_at ?? new Date().toISOString()
  };
  const vehicles = [...garage.vehicles];
  const index = vehicles.findIndex((item) => {
    if (item.key === key) return true;
    if (incoming.plate && item.plate === incoming.plate) return true;
    if (incoming.vin && item.vin === incoming.vin) return true;
    return (
      !incoming.plate &&
      !item.plate &&
      item.make?.toLowerCase() === incoming.make?.toLowerCase() &&
      item.model?.toLowerCase() === incoming.model?.toLowerCase() &&
      item.year === incoming.year
    );
  });
  if (index >= 0) {
    vehicles[index] = { ...vehicles[index], ...next, key: vehicles[index]!.key };
  } else {
    vehicles.unshift(next);
  }
  return {
    ...garage,
    vehicles: vehicles.slice(0, VEHICLE_CAP),
    active_vehicle_key: next.key
  };
}

function productIdentity(item: StoredProductEvent): string {
  return (item.product_id ?? item.sku ?? item.name).toLowerCase();
}

export function upsertGarageProduct(
  list: StoredProductEvent[],
  incoming: StoredProductEvent
): StoredProductEvent[] {
  const id = productIdentity(incoming);
  const next = [incoming, ...list.filter((item) => productIdentity(item) !== id)];
  return next.slice(0, PRODUCT_CAP);
}

export function writeCustomerGarage(
  metadata: unknown,
  garage: CustomerGarage
): Record<string, unknown> {
  const record = asRecord(metadata);
  const active = garage.vehicles.find((item) => item.key === garage.active_vehicle_key) ?? garage.vehicles[0];
  return {
    ...record,
    first_name: garage.first_name,
    last_name: garage.last_name,
    vehicles: garage.vehicles,
    active_vehicle_key: garage.active_vehicle_key,
    active_vehicle_plate: active?.plate ?? record.active_vehicle_plate ?? null,
    active_vehicle: active
      ? {
          make: active.make ?? null,
          model: active.model ?? null,
          year: active.year ?? null,
          year_from: active.year_from ?? null,
          year_to: active.year_to ?? null,
          engine: active.engine ?? null,
          plate: active.plate ?? null,
          vin: active.vin ?? null,
          source: active.source
        }
      : record.active_vehicle ?? null,
    products_consulted: garage.products_consulted,
    products_quoted: garage.products_quoted,
    products_purchased: garage.products_purchased
  };
}

const PURCHASE_RE =
  /\b(ya pagu[eé]|pagu[eé]|transfer[ií]|comprobante|lo compr[eé]|ya lo compr[eé]|me lo llevo|ya pague)\b/i;

export function looksLikePurchaseConfirmation(text: string): boolean {
  return PURCHASE_RE.test(text);
}

export function formatGarageMemory(garage: CustomerGarage): string {
  const lines: string[] = [];
  if (garage.vehicles.length) {
    lines.push(
      `Vehículos (${garage.vehicles.length}): ` +
        garage.vehicles
          .map((item) => {
            const label = [item.make, item.model, item.year, item.plate].filter(Boolean).join(" ");
            return item.key === garage.active_vehicle_key ? `${label} (activo)` : label;
          })
          .join(" | ")
    );
  }
  if (garage.products_consulted.length) {
    lines.push(
      `Consultados antes: ${garage.products_consulted
        .slice(0, 6)
        .map((item) => item.sku ?? item.name)
        .join(", ")}`
    );
  }
  if (garage.products_quoted.length) {
    lines.push(
      `Cotizados antes: ${garage.products_quoted
        .slice(0, 6)
        .map((item) => item.sku ?? item.name)
        .join(", ")}`
    );
  }
  if (garage.products_purchased.length) {
    lines.push(
      `Comprados antes: ${garage.products_purchased
        .slice(0, 6)
        .map((item) => item.sku ?? item.name)
        .join(", ")}`
    );
  }
  return lines.join("\n");
}
