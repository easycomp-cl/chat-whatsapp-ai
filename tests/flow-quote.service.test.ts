import { describe, expect, it } from "vitest";
import { pickCatalogProduct, matchDeliveryCommune } from "../src/modules/flows/flow-quote.service.js";

describe("flow-quote.service", () => {
  it("elige producto por madera y tamaño", () => {
    const products = [
      {
        id: "1",
        sku: "TPM-ROBLE-30X20",
        name: "Tabla parrillera de roble 30x20",
        description: "Tabla de roble",
        price: 28000,
        currency: "CLP",
        category: "tablas",
        tags: [],
        metadata: {}
      },
      {
        id: "2",
        sku: "TPM-RAULI-40X25",
        name: "Tabla parrillera de raulí 40x25",
        description: "Tabla de raulí",
        price: 32000,
        currency: "CLP",
        category: "tablas",
        tags: [],
        metadata: {}
      }
    ];

    const picked = pickCatalogProduct(products, {
      wood: "raulí",
      size: "40x25",
      type: "tabla"
    });

    expect(picked?.sku).toBe("TPM-RAULI-40X25");
    expect(picked?.price).toBe(32000);
  });

  it("calcula despacho por comuna", () => {
    const result = matchDeliveryCommune(
      [
        {
          name: "Maule",
          courier: "Starken",
          defaultPrice: 5000,
          communes: [{ name: "Talca", priceOverride: 4500 }]
        }
      ],
      { method: "delivery", commune: "Talca", region: "Maule" }
    );

    expect(result.price).toBe(4500);
    expect(result.commune).toBe("Talca");
  });

  it("retorna 0 en retiro", () => {
    const result = matchDeliveryCommune([], { method: "pickup", commune: "Talca" });
    expect(result.price).toBe(0);
  });
});
