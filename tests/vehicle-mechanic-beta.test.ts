import { describe, expect, it } from "vitest";
import {
  extractChileanPlates,
  formatChileanPlate,
  isValidChileanPlate,
  normalizeChileanPlate
} from "../src/utils/chilean-plate.js";
import { extractCustomerFactsFromText } from "../src/modules/customers/customer-profile-extract.service.js";
import {
  findVehicleByMakeModelYear,
  resolveVehicleFromText,
  resolveVehiclesFromText,
  UNIVERSAL_PART_SKUS
} from "../src/modules/vehicles/vehicle-catalog.js";
import {
  readCustomerGarage,
  upsertGarageVehicle,
  writeCustomerGarage
} from "../src/modules/customers/customer-garage.js";
import { looksLikeVehicleQuery } from "../src/modules/vehicles/mechanic-agent.service.js";
import { readStoredSystemEvent } from "../src/modules/conversations/system-event.types.js";
import {
  systemEventTitle,
  formatVehicleCardBody,
  buildSystemEvent,
  describeProfileChanges
} from "../src/modules/conversations/system-event-copy.js";
import { toChatTurns } from "../src/modules/runtime/conversation-history.js";
import { formatCustomerMemory } from "../src/modules/runtime/customer-memory.js";
import { buildRuntimeSystemPrompt } from "../src/modules/runtime/prompts.js";

describe("chilean plate", () => {
  it("accepts old and new Chilean formats", () => {
    expect(isValidChileanPlate("AB1234")).toBe(true);
    expect(isValidChileanPlate("BBBB12")).toBe(true);
    expect(isValidChileanPlate("BB BB 12")).toBe(true);
    expect(isValidChileanPlate("HILUX")).toBe(false);
  });

  it("extracts plates from chat text", () => {
    expect(extractChileanPlates("mi patente es BB BB 12")).toEqual(["BBBB12"]);
    expect(normalizeChileanPlate("ab-1234")).toBe("AB1234");
    expect(formatChileanPlate("BBBB12")).toBe("BB BB 12");
  });
});

describe("customer profile extract", () => {
  it("saves name, RUT and address from a greeting", () => {
    const facts = extractCustomerFactsFromText(
      "Hola me llamo Juan Pérez, mi RUT es 12.345.678-5 y vivo en Apoquindo 100, Las Condes"
    );
    expect(facts.display_alias).toBe("Juan Pérez");
    expect(facts.first_name).toBe("Juan");
    expect(facts.last_name).toBe("Pérez");
    expect(facts.tax_id).toBe("12345678-5");
    expect(facts.delivery1_line1).toBe("Apoquindo 100");
    expect(facts.delivery1_commune).toBe("Las Condes");
  });

  it("ignores generic introductions", () => {
    expect(extractCustomerFactsFromText("hola soy el dueño").display_alias).toBeUndefined();
    expect(extractCustomerFactsFromText("quiero un filtro").display_alias).toBeUndefined();
  });
});

describe("vehicle catalog beta", () => {
  it("resolves popular Chilean models from free text", () => {
    const hilux = resolveVehicleFromText("filtro de aceite para Toyota Hilux 2018");
    expect(hilux?.makeName).toBe("Toyota");
    expect(hilux?.name).toBe("Hilux");
    expect(hilux?.fitments.some((item) => item.partType === "oil_filter")).toBe(true);
    expect(findVehicleByMakeModelYear({ make: "Hyundai", model: "Accent", year: 2015 })?.slug).toBe(
      "accent"
    );
  });

  it("keeps several cars and plates in the same garage", () => {
    expect(
      extractCustomerFactsFromText("tengo la patente BB BB 12 y también AB1234").vehicle_plates
    ).toEqual(["BBBB12", "AB1234"]);
    const models = resolveVehiclesFromText("filtro para la Hilux 2018 y pastillas para el Yaris 2016");
    expect(models.map((item) => item.name).sort()).toEqual(["Hilux", "Yaris"]);

    let garage = readCustomerGarage({});
    garage = upsertGarageVehicle(garage, {
      plate: "BBBB12",
      make: "Toyota",
      model: "Hilux",
      year: 2018,
      source: "conversation"
    });
    garage = upsertGarageVehicle(garage, {
      plate: "AB1234",
      make: "Hyundai",
      model: "Accent",
      year: 2015,
      source: "conversation"
    });
    expect(garage.vehicles).toHaveLength(2);
    expect(garage.active_vehicle_key).toContain("AB1234");
    const written = writeCustomerGarage({}, garage);
    expect(Array.isArray(written.vehicles) && written.vehicles).toHaveLength(2);
  });

  it("maps universal oils to catalog SKUs", () => {
    expect(UNIVERSAL_PART_SKUS.oil_5w30).toContain("ECP-ACE-001");
  });

  it("detects mechanic queries", () => {
    expect(looksLikeVehicleQuery("me sirve este filtro para la hilux?")).toBe(true);
    expect(looksLikeVehicleQuery("hola gracias")).toBe(false);
  });
});

describe("system events", () => {
  it("reads structured system bubbles and defaults actor to BOT", () => {
    const event = readStoredSystemEvent({
      system_event: {
        kind: "profile_saved",
        title: "El bot guardó un dato del contacto",
        body: "nombre: Camila",
        payload: { fields: ["display_alias"] }
      }
    });
    expect(event?.kind).toBe("profile_saved");
    expect(event?.actor).toBe("BOT");
    expect(event?.appearance).toBe("blue_pill");
    expect(event?.title).toBe("El bot guardó un dato del contacto");
  });

  it("names the actor in the bubble title", () => {
    expect(systemEventTitle("profile_saved", "BOT")).toBe("El bot guardó un dato del contacto");
    expect(systemEventTitle("profile_updated", "HUMAN")).toBe(
      "El asesor guardó un dato del contacto"
    );
    expect(systemEventTitle("handoff", "HUMAN")).toBe("El asesor tomó la conversación");
    expect(systemEventTitle("mode_changed", "HUMAN")).toBe(
      "El asesor devolvió la conversación al bot"
    );
  });

  it("builds a dark vehicle card without owner data", () => {
    const event = buildSystemEvent(
      "plate_lookup",
      "BOT",
      formatVehicleCardBody({
        plate_display: "BB BB 12",
        make: "Toyota",
        model: "Hilux",
        year: 2018,
        vehicle_type: "CAMIONETA"
      }),
      { make: "Toyota", model: "Hilux", year: 2018 },
      "dark_card"
    );
    expect(event.appearance).toBe("dark_card");
    expect(event.title).toBe("Vehículo del contacto");
    expect(event.body).toContain("Toyota Hilux 2018");
    expect(event.body).not.toMatch(/rut|dueño|owner/i);
  });

  it("describes added and modified profile values for the blue pill", () => {
    const added = describeProfileChanges([
      { field: "email", previous: null, next: "nuevo@correo.com" }
    ]);
    expect(added.added).toEqual(["email: nuevo@correo.com"]);
    expect(added.body).toBe("se añadió: email: nuevo@correo.com");

    const modified = describeProfileChanges([
      { field: "display_alias", previous: "Israel", next: "Isra" }
    ]);
    expect(modified.modified).toEqual(["nombre visible: Israel -> Isra"]);
    expect(modified.body).toBe("se modificó: nombre visible: Israel -> Isra");

    const names = describeProfileChanges([
      { field: "first_name", previous: null, next: "Camila" },
      { field: "last_name", previous: null, next: "Soto" }
    ]);
    expect(names.body).toContain("nombre: Camila");
    expect(names.body).toContain("apellido: Soto");
    expect(names.body).not.toMatch(/vehículos u otros datos/i);
  });

  it("keeps a human actor when stored", () => {
    const event = readStoredSystemEvent({
      system_event: {
        kind: "profile_updated",
        actor: "HUMAN",
        title: "El asesor guardó un dato del contacto",
        body: "RUT",
        payload: { actor: "HUMAN" }
      }
    });
    expect(event?.actor).toBe("HUMAN");
  });

  it("keeps system bubbles out of the LLM history", () => {
    const turns = toChatTurns([
      { senderType: "CUSTOMER", contentText: "hola me llamo Camila" },
      { senderType: "SYSTEM", contentText: "El bot guardó un dato del contacto: nombre: Camila" },
      { senderType: "BOT", contentText: "Hola Camila" }
    ]);
    expect(turns).toEqual([
      { role: "user", content: "hola me llamo Camila" },
      { role: "assistant", content: "Hola Camila" }
    ]);
  });
});

describe("vehicle memory and prompt", () => {
  it("includes plate and vehicle in customer memory", () => {
    const memory = formatCustomerMemory({
      displayAlias: "Juan",
      profileMetadata: {
        last_name: "Pérez",
        active_vehicle_plate: "BBBB12",
        active_vehicle: { make: "Toyota", model: "Hilux", year: 2018 }
      }
    });
    expect(memory).toContain("Nombre: Juan");
    expect(memory).toContain("Apellido: Pérez");
    expect(memory).toContain("Hilux");
    expect(memory).toContain("BBBB12");
  });

  it("injects mechanic beta rules when vehicle context exists", () => {
    const prompt = buildRuntimeSystemPrompt({
      businessName: "EasyComp Repuestos",
      botName: "Guía",
      botTone: "profesional",
      knowledge: "SKU ECP-FIL-002 $7.990",
      vehicleContext: "Vehículo: Toyota Hilux 2018\n- Filtro de aceite: MANN W 610/3"
    });
    expect(prompt).toContain("AGENTE MECÁNICA");
    expect(prompt).toContain("Hilux 2018");
    expect(prompt).toContain("base beta");
  });
});
