import { describe, expect, it } from "vitest";
import { estimateAiCostUsd, isReasoningModel, resolveAiModelPrice } from "../src/modules/runtime/ai-model-pricing.js";
import {
  buildRetrievalQuery,
  isAnaphoricFollowUp,
  toChatTurns
} from "../src/modules/runtime/conversation-history.js";
import { formatCustomerMemory } from "../src/modules/runtime/customer-memory.js";
import { buildRuntimeSystemPrompt } from "../src/modules/runtime/prompts.js";
import { scoreBenchmarkReply } from "../src/modules/runtime/ai-benchmark.scoring.js";

describe("ai-model-pricing", () => {
  it("uses published rates for the three benchmark models", () => {
    expect(resolveAiModelPrice("gpt-4o-mini")).toEqual({ inputPer1M: 0.15, outputPer1M: 0.6 });
    expect(resolveAiModelPrice("gpt-5.6-luna")).toEqual({ inputPer1M: 0.2, outputPer1M: 1.2 });
    expect(resolveAiModelPrice("gpt-5.4-mini")).toEqual({ inputPer1M: 0.75, outputPer1M: 4.5 });
  });

  it("estimates cost from tokens", () => {
    const cost = estimateAiCostUsd({
      model: "gpt-4o-mini",
      tokensInput: 1_000_000,
      tokensOutput: 1_000_000
    });
    expect(cost).toBeCloseTo(0.75);
  });

  it("detects reasoning models", () => {
    expect(isReasoningModel("gpt-5.6-luna")).toBe(true);
    expect(isReasoningModel("gpt-5.4-mini")).toBe(true);
    expect(isReasoningModel("gpt-4o-mini")).toBe(false);
  });
});

describe("conversation history", () => {
  it("maps customer/bot turns and drops the current inbound duplicate", () => {
    const turns = toChatTurns(
      [
        { senderType: "CUSTOMER", contentText: "quiero una tabla" },
        { senderType: "BOT", contentText: "La tabla sale $19.900" },
        { senderType: "CUSTOMER", contentText: "y esa cuanto demora el envio?" }
      ],
      "y esa cuanto demora el envio?"
    );

    expect(turns).toEqual([
      { role: "user", content: "quiero una tabla" },
      { role: "assistant", content: "La tabla sale $19.900" }
    ]);
  });

  it("detects anaphoric follow-ups and expands the RAG query", () => {
    expect(isAnaphoricFollowUp("y ese cuanto sale?")).toBe(true);
    expect(isAnaphoricFollowUp("lo de siempre")).toBe(true);
    expect(isAnaphoricFollowUp("cuanto sale la tabla?")).toBe(false);

    const query = buildRetrievalQuery("y ese cuanto sale?", [
      { role: "user", content: "tienen destapadores?" },
      { role: "assistant", content: "Sí, los destapadores salen $45.000" }
    ]);
    expect(query).toContain("destapadores");
    expect(query).toContain("y ese cuanto sale?");
  });
});

describe("customer memory", () => {
  it("formats profile facts used at runtime", () => {
    const memory = formatCustomerMemory({
      displayAlias: "Camila",
      invoiceType: "RECEIPT",
      delivery1Line1: "Apoquindo 100",
      delivery1Commune: "Las Condes",
      profileMetadata: {
        preferred_payment: "Transferencia",
        allergies: "barniz poliuretano",
        frequent_order: "tabla media camiseta"
      }
    });

    expect(memory).toContain("Nombre: Camila");
    expect(memory).toContain("Documento: Boleta");
    expect(memory).toContain("Despacho: Apoquindo 100, Las Condes");
    expect(memory).toContain("Forma de pago preferida: Transferencia");
    expect(memory).toContain("Alergias: barniz poliuretano");
    expect(memory).toContain("Pedido frecuente: tabla media camiseta");
  });
});

describe("runtime prompt", () => {
  it("includes customer memory and history instructions", () => {
    const prompt = buildRuntimeSystemPrompt({
      businessName: "EasyComp Piloto",
      botName: "Woody",
      botTone: "amigable",
      knowledge: "La tabla cuesta $19.900",
      customerMemory: "Nombre: Camila\nAlergias: barniz poliuretano"
    });

    expect(prompt).toContain("DATOS DEL CLIENTE");
    expect(prompt).toContain("barniz poliuretano");
    expect(prompt).toContain("lo de siempre");
    expect(prompt).toContain("La tabla cuesta $19.900");
  });
});

describe("benchmark scoring", () => {
  it("passes when expected facts appear and forbidden ones do not", () => {
    const result = scoreBenchmarkReply("Los destapadores salen $45.000. Te armo el pedido por transferencia.", {
      requireAny: ["45.000", "45000"],
      forbidAny: ["19.900"]
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when the model answers the wrong product", () => {
    const result = scoreBenchmarkReply("La tabla sale $19.900", {
      requireAny: ["45.000", "45000"],
      forbidAny: ["19.900"]
    });
    expect(result.passed).toBe(false);
  });
});
