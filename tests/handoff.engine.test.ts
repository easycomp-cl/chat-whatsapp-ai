import { describe, expect, it } from "vitest";
import { HANDOFF_REASON_LABELS } from "../src/modules/runtime/prompts.js";

describe("Handoff labels", () => {
  it("has labels for all handoff reasons", () => {
    expect(HANDOFF_REASON_LABELS.user_requested_human).toContain("humano");
    expect(HANDOFF_REASON_LABELS.low_rag_confidence).toContain("RAG");
    expect(HANDOFF_REASON_LABELS.complaint).toContain("Reclamo");
  });
});
