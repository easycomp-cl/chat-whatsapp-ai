import { describe, expect, it } from "vitest";
import { createWoodQuoteFlowGraph } from "../src/modules/flows/domain/flow-defaults.js";
import { parseFlowDefinitionGraph } from "../src/modules/flows/domain/flow-definition.schema.js";
import { flowSimulatorService } from "../src/modules/flows/flow-simulator.service.js";

describe("flow-definition.schema", () => {
  it("valida la plantilla wood_quote", () => {
    const graph = createWoodQuoteFlowGraph("Cotización tablas");
    expect(() => parseFlowDefinitionGraph(graph)).not.toThrow();
    expect(graph.fields.length).toBeGreaterThan(5);
    expect(graph.nodes.some((n) => n.type === "review")).toBe(true);
  });

  it("rechaza grafo sin nodo start", () => {
    expect(() =>
      parseFlowDefinitionGraph({
        trigger: { type: "manual" },
        fields: [],
        nodes: [{ id: "only", type: "end", config: {} }],
        edges: []
      })
    ).toThrow();
  });
});

describe("flow-simulator", () => {
  it("simula captura básica de cantidad y madera", () => {
    const graph = createWoodQuoteFlowGraph("Cotización tablas");
    const result = flowSimulatorService.simulate(graph, [
      {
        role: "customer",
        content: "Quiero 8 tablas de raulí con mi logo"
      }
    ]);

    expect(result.detected_intent).toBe("request_custom_quote");
    expect(result.captured_fields["product.quantity"]).toBe(8);
    expect(result.captured_fields["product.wood"]).toMatch(/raul/i);
    expect(result.missing_fields.length).toBeGreaterThan(0);
    expect(result.next_message).toBeTruthy();
  });
});
