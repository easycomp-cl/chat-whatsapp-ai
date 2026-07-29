import { describe, expect, it } from "vitest";
import { createWoodQuoteFlowGraph } from "../src/modules/flows/domain/flow-defaults.js";
import {
  evaluateCondition,
  interpolateTemplate,
  parseYesNo,
  resolveNextNodeId,
  setNestedValue
} from "../src/modules/flows/domain/flow-graph.utils.js";
import {
  buildMissingFieldsPrompt,
  extractSimpleFieldsFromText,
  getMissingRequiredFields,
  upsertSlot,
  emptyVariablesState
} from "../src/modules/flows/domain/flow-slots.js";

describe("flow-graph.utils", () => {
  it("interpola plantillas con variables anidadas", () => {
    const vars = setNestedValue({}, "customer.name", "Camila");
    expect(interpolateTemplate("Hola {{customer.name}}", vars)).toBe("Hola Camila");
  });

  it("evalúa equals en condiciones", () => {
    expect(
      evaluateCondition(
        { field: "engraving.type", operator: "equals", value: "logo" },
        { engraving: { type: "logo" } }
      )
    ).toBe(true);
  });

  it("resuelve siguiente nodo por edge", () => {
    const graph = createWoodQuoteFlowGraph("Test");
    const next = resolveNextNodeId(graph, "start", {});
    expect(next).toBe("analyze-conversation");
  });

  it("parsea respuestas afirmativas", () => {
    expect(parseYesNo("sí")).toBe("yes");
    expect(parseYesNo("no")).toBe("no");
  });
});

describe("flow-slots", () => {
  it("detecta campos faltantes requeridos", () => {
    const graph = createWoodQuoteFlowGraph("Test");
    const state = emptyVariablesState();
    const missing = getMissingRequiredFields(graph.fields, state);
    expect(missing.length).toBeGreaterThan(0);
    expect(buildMissingFieldsPrompt(missing)).toContain("Nombre");
  });

  it("extrae cantidad y madera desde texto", () => {
    const graph = createWoodQuoteFlowGraph("Test");
    const extracted = extractSimpleFieldsFromText(
      "Quiero 8 tablas de raulí",
      graph.fields
    );
    const map = Object.fromEntries(extracted.map((e) => [e.key, e.value]));
    expect(map["product.quantity"]).toBe(8);
    expect(String(map["product.wood"])).toMatch(/raul/i);
  });

  it("guarda slots en estado", () => {
    const state = upsertSlot(emptyVariablesState(), "product.quantity", 8);
    expect(state.slots["product.quantity"]?.value).toBe(8);
    expect(state.flat.product).toEqual({ quantity: 8 });
  });
});
