import { describe, expect, it } from "vitest";
import {
  buildQualificationGreeting,
  buildQualificationState,
  extractNeedFromText,
  resolveKnownPersonName
} from "../src/modules/runtime/qualification.js";
import { buildRuntimeSystemPrompt } from "../src/modules/runtime/prompts.js";
import { extractCustomerFactsFromText } from "../src/modules/customers/customer-profile-extract.service.js";

describe("qualification funnel", () => {
  it("asks for name on new-customer greeting", () => {
    expect(
      buildQualificationGreeting({
        saludo: "Hola, soy Guía.",
        hasName: false,
        isReturning: false
      })
    ).toContain("¿Me dices tu nombre");
  });

  it("does not treat phone as a person name", () => {
    expect(
      resolveKnownPersonName({
        displayAlias: null,
        name: "+56912345678"
      })
    ).toBeNull();
  });

  it("orders missing slots: name → vehicle when need is in the message", () => {
    const state = buildQualificationState({
      incomingText: "necesito pastillas de freno",
      mechanicEnabled: true,
      profileMetadata: {}
    });
    expect(state.mechanicMode).toBe(true);
    expect(state.known.need).toMatch(/pastillas/i);
    expect(state.missing).toEqual(["name", "vehicle"]);
    expect(state.nextAsk).toBe("name");
    expect(state.promptBlock).toContain("EMBUDO DE CALIFICACIÓN");
    expect(state.promptBlock).toContain("patente");
  });

  it("skips name/need when known and prioritizes plate", () => {
    const state = buildQualificationState({
      displayAlias: "Camila",
      incomingText: "necesito pastillas",
      mechanicEnabled: true,
      profileMetadata: {
        first_name: "Camila",
        last_need: "pastillas"
      }
    });
    expect(state.missing).toEqual(["vehicle"]);
    expect(state.nextAsk).toBe("vehicle");
  });

  it("asks delivery after fitment is ready", () => {
    const state = buildQualificationState({
      displayAlias: "Camila",
      incomingText: "ok",
      mechanicEnabled: true,
      fitmentReady: true,
      profileMetadata: {
        first_name: "Camila",
        last_need: "pastillas",
        vehicles: [
          {
            key: "plate:BBBB12",
            plate: "BBBB12",
            make: "Toyota",
            model: "Hilux",
            year: 2018,
            source: "plate_lookup",
            last_seen_at: new Date().toISOString()
          }
        ],
        active_vehicle_key: "plate:BBBB12"
      }
    });
    expect(state.vehicleIdentified).toBe(true);
    expect(state.missing).toContain("delivery_preference");
  });

  it("blocks catalog listing in the prompt until vehicle is known", () => {
    const qualification = buildQualificationState({
      incomingText: "necesito pastillas",
      mechanicEnabled: true
    });
    const prompt = buildRuntimeSystemPrompt({
      businessName: "EasyComp",
      botName: "Guía",
      botTone: "cercano",
      knowledge: "",
      qualificationBlock: qualification.promptBlock,
      blockPartsCatalogUntilVehicle: true,
      vehicleContext:
        "PRIORIDAD ANTI-ALUCINACIÓN: falta patente. PROHIBIDO listar SKUs."
    });
    expect(prompt).toContain("RESTRICCIÓN ACTIVA");
    expect(prompt).not.toContain("ECP-PAS-001");
    expect(prompt).toContain("EMBUDO DE CALIFICACIÓN");
  });
});

describe("enriched inbound extract", () => {
  it("captures Camila por acá and need", () => {
    const facts = extractCustomerFactsFromText("Camila por acá, necesito pastillas de freno");
    expect(facts.display_alias).toBe("Camila");
    expect(facts.last_need).toMatch(/pastillas/i);
  });

  it("captures delivery preference", () => {
    expect(extractCustomerFactsFromText("despacho a Maipú").delivery_preference).toBe("delivery");
    expect(extractCustomerFactsFromText("retiro en el local").delivery_preference).toBe("pickup");
  });

  it("extracts need phrases", () => {
    expect(extractNeedFromText("necesito filtro de aceite")).toMatch(/filtro/i);
  });
});
