import { describe, expect, it } from "vitest";
import { matchCatalogProductsFromText } from "../src/modules/quotes/product-quote-match.js";
import { buildProductQuotePdf } from "../src/modules/quotes/product-quote-pdf.js";
import { DEFAULT_QUOTE_NOTES } from "../src/modules/quotes/product-quote.types.js";
import {
  defaultQuoteCaption,
  extractDeliveryFromText,
  isProductQuoteRequest,
  nextQuoteNumber
} from "../src/modules/quotes/product-quote.utils.js";
import { detectHandoffReason } from "../src/modules/runtime/prompts.js";

const catalog = [
  {
    id: "ace-1l",
    sku: "ECP-ACE-005",
    name: "LIQUI MOLY Molygen New Generation 10W-40 1 L",
    description: "Aceite 10W-40 bidón 1 L",
    price: 11990,
    category: "Aceites",
    tags: ["aceite", "10w-40", "1l"]
  },
  {
    id: "ace-4l",
    sku: "ECP-ACE-006",
    name: "LIQUI MOLY Molygen New Generation 10W-40 4 L",
    description: "Aceite 10W-40 bidón 4 L",
    price: 41990,
    category: "Aceites",
    tags: ["aceite", "10w-40", "4l"]
  },
  {
    id: "h4",
    sku: "ECP-AMP-001",
    name: "OSRAM Ampolleta H4 12 V",
    description: "Ampolleta H4",
    price: 4490,
    category: "Ampolletas",
    tags: ["h4", "ampolleta", "luces"]
  },
  {
    id: "esc-22",
    sku: "ECP-ESC-006",
    name: "BOSCH Escobilla Aerotwin 22 pulgadas",
    description: "Escobilla 22 pulgadas",
    price: 18990,
    category: "Escobillas",
    tags: ["escobilla", "goma", "22"]
  }
];

describe("product quote utils", () => {
  it("asigna correlativo COT-YYYY-0001", () => {
    expect(nextQuoteNumber([], 2026)).toBe("COT-2026-0001");
    expect(nextQuoteNumber(["COT-2026-0003", "COT-2025-0099"], 2026)).toBe("COT-2026-0004");
  });

  it("detecta pedido de cotización", () => {
    expect(isProductQuoteRequest("cotízame el 10W40 y dos H4")).toBe(true);
    expect(isProductQuoteRequest("pásame la cotización")).toBe(true);
    expect(isProductQuoteRequest("lo quiero")).toBe(true);
    expect(isProductQuoteRequest("tienen horario el sábado?")).toBe(false);
  });

  it("extrae retiro, despacho y comuna", () => {
    expect(extractDeliveryFromText("retiro en el local")).toEqual({ method: "pickup", commune: null });
    expect(extractDeliveryFromText("envío a Maipú")).toMatchObject({
      method: "delivery",
      commune: "Maipú"
    });
  });

  it("arma caption por defecto", () => {
    const caption = defaultQuoteCaption({
      customerName: "Camila",
      quoteNumber: "COT-2026-0001",
      total: 50970
    });
    expect(caption).toContain("COT-2026-0001");
    expect(caption).toContain("Camila");
    expect(caption).toMatch(/retiro|despacho/i);
  });
});

describe("product quote catalog match", () => {
  it("prioriza aceite 4 L y luces H4", () => {
    const lines = matchCatalogProductsFromText(
      "cotízame el aceite 10W-40 de 4 litros y 2 luces H4",
      catalog
    );
    const ids = lines.map((line) => line.product_id);
    expect(ids).toContain("ace-4l");
    expect(ids).not.toContain("ace-1l");
    expect(ids).toContain("h4");
    expect(lines.find((line) => line.product_id === "h4")?.quantity).toBe(2);
  });

  it("matchea SKU exacto", () => {
    const lines = matchCatalogProductsFromText("quiero 3 x ECP-ESC-006", catalog);
    expect(lines).toEqual([
      expect.objectContaining({ product_id: "esc-22", quantity: 3 })
    ]);
  });
});

describe("product quote pdf", () => {
  it("genera un PDF con header %PDF", async () => {
    const buffer = await buildProductQuotePdf({
      quote_number: "COT-2026-0001",
      business_name: "EasyComp Repuestos",
      customer_name: "Camila",
      customer_phone: "+56911111111",
      currency: "CLP",
      customer_note: "Hilux 2018",
      delivery: {
        method: "pickup",
        label: "Retiro en local",
        price: 0,
        commune: null,
        confirmed: true
      },
      lines: [
        {
          product_id: "ace-4l",
          sku: "ECP-ACE-006",
          name: "Molygen 10W-40 4 L",
          quantity: 1,
          unit_price: 41990,
          line_total: 41990
        },
        {
          product_id: "h4",
          sku: "ECP-AMP-001",
          name: "Ampolleta H4",
          quantity: 2,
          unit_price: 4490,
          line_total: 8980
        }
      ],
      products_subtotal: 50970,
      delivery_price: 0,
      total: 50970,
      notes: DEFAULT_QUOTE_NOTES,
      issued_at: "2026-09-17T12:00:00.000Z"
    });

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
  });
});

describe("handoff keywords for auto parts", () => {
  it("does not escalate cambio de aceite", () => {
    expect(detectHandoffReason("necesito un cambio de aceite 10w40")).toBeNull();
  });

  it("does not escalate ruta as RUT", () => {
    expect(detectHandoffReason("sigo en ruta y necesito luces H4")).toBeNull();
  });

  it("escalates an explicit RUT", () => {
    expect(detectHandoffReason("te paso mi rut 12345678-9")).toBe("sensitive_topic");
  });

  it("still escalates a return", () => {
    expect(detectHandoffReason("quiero una devolución")).toBe("warranty_return");
  });
});
