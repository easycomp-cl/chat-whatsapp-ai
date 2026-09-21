export type VehiclePartType =
  | "oil_5w30"
  | "oil_5w40"
  | "oil_10w40"
  | "oil_filter"
  | "air_filter"
  | "cabin_filter"
  | "brake_pad_front"
  | "brake_pad_rear"
  | "spark_plug"
  | "spark_plug_iridium"
  | "wiper"
  | "bulb_h4"
  | "bulb_h7"
  | "bulb_h1"
  | "bulb_h3"
  | "bulb_hb3"
  | "bulb_hb4"
  | "bulb_w5w"
  | "bulb_p21w";

export type SeedFitment = {
  partType: VehiclePartType;
  skuHint?: string;
  spec?: string;
  notes?: string;
};

export type SeedVehicleModel = {
  makeSlug: string;
  makeName: string;
  makeAliases?: string[];
  slug: string;
  name: string;
  yearFrom: number;
  yearTo?: number;
  engine?: string;
  aliases?: string[];
  notes?: string;
  fitments: SeedFitment[];
};

export const VEHICLE_MAKES: Array<{ slug: string; name: string; aliases: string[] }> = [
  { slug: "toyota", name: "Toyota", aliases: ["toyoya"] },
  { slug: "hyundai", name: "Hyundai", aliases: ["hiunday", "hundai"] },
  { slug: "chevrolet", name: "Chevrolet", aliases: ["chevy", "chevrolete"] },
  { slug: "kia", name: "Kia", aliases: [] },
  { slug: "nissan", name: "Nissan", aliases: [] },
  { slug: "suzuki", name: "Suzuki", aliases: [] },
  { slug: "mazda", name: "Mazda", aliases: [] },
  { slug: "mitsubishi", name: "Mitsubishi", aliases: ["mitsu"] },
  { slug: "ford", name: "Ford", aliases: [] },
  { slug: "volkswagen", name: "Volkswagen", aliases: ["vw", "volks"] },
  { slug: "honda", name: "Honda", aliases: [] },
  { slug: "renault", name: "Renault", aliases: [] },
  { slug: "peugeot", name: "Peugeot", aliases: [] },
  { slug: "mg", name: "MG", aliases: [] },
  { slug: "subaru", name: "Subaru", aliases: [] }
];

function oilSpec(partType: "oil_5w30" | "oil_5w40" | "oil_10w40"): SeedFitment {
  const spec = partType === "oil_5w30" ? "5W-30" : partType === "oil_5w40" ? "5W-40" : "10W-40";
  return { partType, spec, notes: "Confirmar viscosidad en el manual del motor." };
}

export const VEHICLE_SEED: SeedVehicleModel[] = [
  {
    makeSlug: "toyota",
    makeName: "Toyota",
    slug: "hilux",
    name: "Hilux",
    yearFrom: 2016,
    yearTo: 2024,
    engine: "2.4/2.8 diésel",
    aliases: ["hi lux"],
    notes: "Pickup. Muchas versiones diésel; confirmar motor antes de filtro/bujías.",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3", notes: "Aplicación frecuente 1GD/2GD; confirmar OEM." },
      { partType: "air_filter", skuHint: "ECP-FIL-005", spec: "MANN C 14 130" },
      { partType: "cabin_filter", skuHint: "ECP-FIL-008", spec: "MANN CU 1919" },
      { partType: "wiper", spec: "22/20", notes: "Parabrisas conductor ~22\", acompañante ~20\"." },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "toyota",
    makeName: "Toyota",
    slug: "yaris",
    name: "Yaris",
    yearFrom: 2014,
    yearTo: 2020,
    engine: "1.5 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3" },
      { partType: "air_filter", skuHint: "ECP-FIL-006", spec: "MANN C 27 009" },
      { partType: "cabin_filter", skuHint: "ECP-FIL-007", spec: "MANN CU 1828" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-001", spec: "NGK BKR5E-11" },
      { partType: "spark_plug_iridium", skuHint: "ECP-BUJ-003", spec: "NGK BKR5EIX-11" },
      { partType: "wiper", spec: "26/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "toyota",
    makeName: "Toyota",
    slug: "corolla",
    name: "Corolla",
    yearFrom: 2014,
    yearTo: 2019,
    engine: "1.8 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-001", spec: "NGK BKR5E-11" },
      { partType: "spark_plug_iridium", skuHint: "ECP-BUJ-003", spec: "NGK BKR5EIX-11" },
      { partType: "wiper", spec: "26/16" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "toyota",
    makeName: "Toyota",
    slug: "rav4",
    name: "RAV4",
    yearFrom: 2013,
    yearTo: 2018,
    engine: "2.0/2.5 nafta",
    aliases: ["rav 4"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "26/18" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7", notes: "Algunas versiones usan H11; confirmar óptica." }
    ]
  },
  {
    makeSlug: "hyundai",
    makeName: "Hyundai",
    slug: "accent",
    name: "Accent",
    yearFrom: 2011,
    yearTo: 2017,
    engine: "1.4/1.6 nafta",
    aliases: ["rb"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-004", spec: "MANN W 712/95" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-001", spec: "NGK BKR5E-11" },
      { partType: "brake_pad_front", skuHint: "ECP-FRE-005", spec: "BREMBO P 59 051", notes: "Confirmar sistema Bosch/Mando." },
      { partType: "wiper", spec: "22/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "hyundai",
    makeName: "Hyundai",
    slug: "tucson",
    name: "Tucson",
    yearFrom: 2016,
    yearTo: 2021,
    engine: "2.0 nafta/diésel",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-004", spec: "MANN W 712/95" },
      { partType: "cabin_filter", skuHint: "ECP-FIL-008", spec: "MANN CU 1919" },
      { partType: "wiper", spec: "26/16" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "hyundai",
    makeName: "Hyundai",
    slug: "grand-i10",
    name: "Grand i10",
    yearFrom: 2014,
    yearTo: 2020,
    engine: "1.2 nafta",
    aliases: ["grandi10", "grand i10", "i10"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-001", spec: "MANN W 68/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-001", spec: "NGK BKR5E-11" },
      { partType: "wiper", spec: "22/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "chevrolet",
    makeName: "Chevrolet",
    slug: "sail",
    name: "Sail",
    yearFrom: 2010,
    yearTo: 2016,
    engine: "1.4 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-001", spec: "MANN W 68/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "22/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "chevrolet",
    makeName: "Chevrolet",
    slug: "spark",
    name: "Spark",
    yearFrom: 2010,
    yearTo: 2016,
    engine: "1.2 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-001", spec: "MANN W 68/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "21/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "chevrolet",
    makeName: "Chevrolet",
    slug: "tracker",
    name: "Tracker",
    yearFrom: 2020,
    yearTo: 2024,
    engine: "1.2 turbo",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-003", spec: "MANN W 811/80" },
      { partType: "wiper", spec: "24/16" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "kia",
    makeName: "Kia",
    slug: "morning",
    name: "Morning",
    yearFrom: 2011,
    yearTo: 2017,
    engine: "1.0/1.2 nafta",
    aliases: ["picanto"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-001", spec: "MANN W 68/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-001", spec: "NGK BKR5E-11" },
      { partType: "wiper", spec: "22/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "kia",
    makeName: "Kia",
    slug: "rio",
    name: "Rio",
    yearFrom: 2012,
    yearTo: 2017,
    engine: "1.4 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-004", spec: "MANN W 712/95" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-001", spec: "NGK BKR5E-11" },
      { partType: "wiper", spec: "24/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "kia",
    makeName: "Kia",
    slug: "sportage",
    name: "Sportage",
    yearFrom: 2016,
    yearTo: 2021,
    engine: "2.0 nafta/diésel",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-004", spec: "MANN W 712/95" },
      { partType: "cabin_filter", skuHint: "ECP-FIL-008", spec: "MANN CU 1919" },
      { partType: "wiper", spec: "26/16" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "nissan",
    makeName: "Nissan",
    slug: "versa",
    name: "Versa",
    yearFrom: 2012,
    yearTo: 2019,
    engine: "1.6 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "26/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "nissan",
    makeName: "Nissan",
    slug: "qashqai",
    name: "Qashqai",
    yearFrom: 2014,
    yearTo: 2020,
    engine: "2.0 nafta",
    aliases: ["cashcai", "qashqay"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-003", spec: "MANN W 811/80" },
      { partType: "wiper", spec: "26/16" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "nissan",
    makeName: "Nissan",
    slug: "navara",
    name: "Navara",
    yearFrom: 2015,
    yearTo: 2021,
    engine: "2.3 diésel",
    aliases: ["np300"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-003", spec: "MANN W 811/80" },
      { partType: "wiper", spec: "22/20" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "suzuki",
    makeName: "Suzuki",
    slug: "swift",
    name: "Swift",
    yearFrom: 2011,
    yearTo: 2017,
    engine: "1.2/1.4 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-001", spec: "MANN W 68/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "22/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "mazda",
    makeName: "Mazda",
    slug: "3",
    name: "3",
    yearFrom: 2014,
    yearTo: 2018,
    engine: "2.0 nafta",
    aliases: ["mazda3", "mazda 3"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "24/18" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7", notes: "Algunas versiones usan H11; confirmar óptica." }
    ]
  },
  {
    makeSlug: "mitsubishi",
    makeName: "Mitsubishi",
    slug: "l200",
    name: "L200",
    yearFrom: 2016,
    yearTo: 2023,
    engine: "2.4 diésel",
    aliases: ["l 200", "triton"],
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-003", spec: "MANN W 811/80" },
      { partType: "wiper", spec: "22/20" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "ford",
    makeName: "Ford",
    slug: "ranger",
    name: "Ranger",
    yearFrom: 2016,
    yearTo: 2022,
    engine: "2.2/3.2 diésel",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-003", spec: "MANN W 811/80" },
      { partType: "brake_pad_front", skuHint: "ECP-FRE-002", spec: "BREMBO P 83 082", notes: "Confirmar sistema Akebono." },
      { partType: "wiper", spec: "22/20" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "volkswagen",
    makeName: "Volkswagen",
    slug: "gol",
    name: "Gol",
    yearFrom: 2013,
    yearTo: 2021,
    engine: "1.6 nafta",
    fitments: [
      oilSpec("oil_5w40"),
      { partType: "oil_filter", skuHint: "ECP-FIL-004", spec: "MANN W 712/95" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "21/18" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "volkswagen",
    makeName: "Volkswagen",
    slug: "amarok",
    name: "Amarok",
    yearFrom: 2010,
    yearTo: 2020,
    engine: "2.0 diésel",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-003", spec: "MANN W 811/80" },
      { partType: "wiper", spec: "24/21" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "honda",
    makeName: "Honda",
    slug: "civic",
    name: "Civic",
    yearFrom: 2016,
    yearTo: 2021,
    engine: "1.5 turbo / 2.0",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3" },
      { partType: "spark_plug_iridium", skuHint: "ECP-BUJ-004", spec: "NGK BKR6EIX-11" },
      { partType: "wiper", spec: "26/18" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "renault",
    makeName: "Renault",
    slug: "duster",
    name: "Duster",
    yearFrom: 2015,
    yearTo: 2020,
    engine: "1.6/2.0 nafta",
    fitments: [
      oilSpec("oil_5w40"),
      { partType: "oil_filter", skuHint: "ECP-FIL-004", spec: "MANN W 712/95" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "22/16" },
      { partType: "bulb_h4", skuHint: "ECP-AMP-001", spec: "H4" }
    ]
  },
  {
    makeSlug: "peugeot",
    makeName: "Peugeot",
    slug: "301",
    name: "301",
    yearFrom: 2013,
    yearTo: 2018,
    engine: "1.6 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-004", spec: "MANN W 712/95" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-001", spec: "NGK BKR5E-11" },
      { partType: "wiper", spec: "26/16" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "mg",
    makeName: "MG",
    slug: "zs",
    name: "ZS",
    yearFrom: 2018,
    yearTo: 2024,
    engine: "1.5 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-003", spec: "MANN W 811/80" },
      { partType: "wiper", spec: "24/16" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  },
  {
    makeSlug: "subaru",
    makeName: "Subaru",
    slug: "forester",
    name: "Forester",
    yearFrom: 2013,
    yearTo: 2018,
    engine: "2.0/2.5 nafta",
    fitments: [
      oilSpec("oil_5w30"),
      { partType: "oil_filter", skuHint: "ECP-FIL-002", spec: "MANN W 610/3" },
      { partType: "spark_plug", skuHint: "ECP-BUJ-002", spec: "NGK BKR6E-11" },
      { partType: "wiper", spec: "24/18" },
      { partType: "bulb_h7", skuHint: "ECP-AMP-002", spec: "H7" }
    ]
  }
];

const WIPER_SKU_BY_SIZE: Record<string, string> = {
  "16": "ECP-ESC-001",
  "18": "ECP-ESC-002",
  "19": "ECP-ESC-003",
  "20": "ECP-ESC-004",
  "21": "ECP-ESC-005",
  "22": "ECP-ESC-006",
  "24": "ECP-ESC-007",
  "26": "ECP-ESC-008"
};

export const UNIVERSAL_PART_SKUS: Record<string, string[]> = {
  oil_5w30: ["ECP-ACE-001", "ECP-ACE-002"],
  oil_5w40: ["ECP-ACE-003", "ECP-ACE-004"],
  oil_10w40: ["ECP-ACE-005", "ECP-ACE-006"],
  bulb_h4: ["ECP-AMP-001"],
  bulb_h7: ["ECP-AMP-002"],
  bulb_h1: ["ECP-AMP-003"],
  bulb_h3: ["ECP-AMP-004"],
  bulb_hb3: ["ECP-AMP-005"],
  bulb_hb4: ["ECP-AMP-006"],
  bulb_w5w: ["ECP-AMP-007"],
  bulb_p21w: ["ECP-AMP-008"]
};

export function wiperSkusFromSpec(spec: string | undefined): string[] {
  if (!spec) return [];
  const sizes = spec.match(/\d{2}/g) ?? [];
  return [...new Set(sizes.map((size) => WIPER_SKU_BY_SIZE[size]).filter((sku): sku is string => Boolean(sku)))];
}

export function normalizeVehicleToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ResolvedVehicle = {
  makeSlug: string;
  makeName: string;
  slug: string;
  name: string;
  yearFrom: number;
  yearTo?: number;
  engine?: string;
  notes?: string;
  year?: number;
  fitments: SeedFitment[];
  source: "seed" | "database";
};

export function resolveVehicleFromText(
  text: string,
  preferredYear?: number
): ResolvedVehicle | null {
  return resolveVehiclesFromText(text, preferredYear)[0] ?? null;
}

function toResolved(model: SeedVehicleModel, year?: number): ResolvedVehicle {
  return {
    makeSlug: model.makeSlug,
    makeName: model.makeName,
    slug: model.slug,
    name: model.name,
    yearFrom: model.yearFrom,
    ...(model.yearTo != null ? { yearTo: model.yearTo } : {}),
    ...(model.engine ? { engine: model.engine } : {}),
    ...(model.notes ? { notes: model.notes } : {}),
    ...(year != null ? { year } : {}),
    fitments: model.fitments,
    source: "seed"
  };
}

function yearNearModel(text: string, modelName: string): number | undefined {
  const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}[^\\d]{0,28}((?:19|20)\\d{2})|((?:19|20)\\d{2})[^\\d]{0,28}${escaped}`,
    "i"
  );
  const match = text.match(re);
  const year = match?.[1] ?? match?.[2];
  return year ? Number(year) : undefined;
}

export function resolveVehiclesFromText(
  text: string,
  preferredYear?: number
): ResolvedVehicle[] {
  const normalized = ` ${normalizeVehicleToken(text)} `;
  const years = [...text.matchAll(/\b((?:19|20)\d{2})\b/g)].map((item) => Number(item[1]));
  const fallbackYear = preferredYear ?? years[0];

  const ranked = VEHICLE_SEED
    .map((model) => {
      const make = VEHICLE_MAKES.find((item) => item.slug === model.makeSlug);
      const names = [
        model.name,
        model.slug.replace(/-/g, " "),
        ...(model.aliases ?? [])
      ];
      const makeHit = Boolean(
        make &&
          (normalized.includes(` ${normalizeVehicleToken(make.name)} `) ||
            make.aliases.some((alias) => normalized.includes(` ${normalizeVehicleToken(alias)} `)))
      );
      const modelHit = names.some((name) => normalized.includes(` ${normalizeVehicleToken(name)} `));
      if (!modelHit) return null;
      const localYear = yearNearModel(text, model.name) ?? fallbackYear;
      const yearOk =
        localYear == null ||
        (localYear >= model.yearFrom && localYear <= (model.yearTo ?? model.yearFrom + 20));
      const score = (makeHit ? 4 : 0) + (modelHit ? 3 : 0) + (yearOk && localYear != null ? 2 : 0);
      return { model, score, year: localYear };
    })
    .filter(
      (item): item is { model: SeedVehicleModel; score: number; year: number | undefined } =>
        item != null && item.score >= 3
    )
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const resolved: ResolvedVehicle[] = [];
  for (const entry of ranked) {
    const id = `${entry.model.makeSlug}:${entry.model.slug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    resolved.push(toResolved(entry.model, entry.year));
  }
  return resolved;
}

export function findVehicleByMakeModelYear(input: {
  make?: string;
  model?: string;
  year?: number;
}): ResolvedVehicle | null {
  const makeToken = input.make ? normalizeVehicleToken(input.make) : "";
  const modelToken = input.model ? normalizeVehicleToken(input.model) : "";
  if (!modelToken) return null;

  const matches = VEHICLE_SEED.filter((model) => {
    const make = VEHICLE_MAKES.find((item) => item.slug === model.makeSlug);
    const makeOk =
      !makeToken ||
      normalizeVehicleToken(model.makeName) === makeToken ||
      normalizeVehicleToken(model.makeSlug) === makeToken ||
      Boolean(make?.aliases.some((alias) => normalizeVehicleToken(alias) === makeToken));
    const modelOk =
      normalizeVehicleToken(model.name) === modelToken ||
      normalizeVehicleToken(model.slug.replace(/-/g, " ")) === modelToken ||
      Boolean(model.aliases?.some((alias) => normalizeVehicleToken(alias) === modelToken));
    const yearOk =
      input.year == null ||
      (input.year >= model.yearFrom && input.year <= (model.yearTo ?? model.yearFrom + 20));
    return makeOk && modelOk && yearOk;
  });

  const model = matches[0];
  if (!model) return null;
  return {
    makeSlug: model.makeSlug,
    makeName: model.makeName,
    slug: model.slug,
    name: model.name,
    yearFrom: model.yearFrom,
    ...(model.yearTo != null ? { yearTo: model.yearTo } : {}),
    ...(model.engine ? { engine: model.engine } : {}),
    ...(model.notes ? { notes: model.notes } : {}),
    ...(input.year != null ? { year: input.year } : {}),
    fitments: model.fitments,
    source: "seed"
  };
}

export function searchVehicleModels(query: string, limit = 20): ResolvedVehicle[] {
  const token = normalizeVehicleToken(query);
  if (!token) {
    return VEHICLE_SEED.slice(0, limit).map((model) => ({
      makeSlug: model.makeSlug,
      makeName: model.makeName,
      slug: model.slug,
      name: model.name,
      yearFrom: model.yearFrom,
      ...(model.yearTo != null ? { yearTo: model.yearTo } : {}),
      ...(model.engine ? { engine: model.engine } : {}),
      fitments: model.fitments,
      source: "seed" as const
    }));
  }

  return VEHICLE_SEED.filter((model) => {
    const blob = normalizeVehicleToken(
      `${model.makeName} ${model.name} ${model.slug} ${(model.aliases ?? []).join(" ")}`
    );
    return blob.includes(token);
  })
    .slice(0, limit)
    .map((model) => ({
      makeSlug: model.makeSlug,
      makeName: model.makeName,
      slug: model.slug,
      name: model.name,
      yearFrom: model.yearFrom,
      ...(model.yearTo != null ? { yearTo: model.yearTo } : {}),
      ...(model.engine ? { engine: model.engine } : {}),
      fitments: model.fitments,
      source: "seed" as const
    }));
}

export const PART_TYPE_LABELS: Record<string, string> = {
  oil_5w30: "Aceite 5W-30",
  oil_5w40: "Aceite 5W-40",
  oil_10w40: "Aceite 10W-40",
  oil_filter: "Filtro de aceite",
  air_filter: "Filtro de aire",
  cabin_filter: "Filtro de cabina",
  brake_pad_front: "Pastillas delanteras",
  brake_pad_rear: "Pastillas traseras",
  spark_plug: "Bujía",
  spark_plug_iridium: "Bujía iridium",
  wiper: "Escobillas",
  bulb_h4: "Ampolleta H4",
  bulb_h7: "Ampolleta H7",
  bulb_h1: "Ampolleta H1",
  bulb_h3: "Ampolleta H3",
  bulb_hb3: "Ampolleta HB3",
  bulb_hb4: "Ampolleta HB4",
  bulb_w5w: "Ampolleta W5W",
  bulb_p21w: "Ampolleta P21W"
};
