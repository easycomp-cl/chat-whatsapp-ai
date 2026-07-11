import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConversationMode } from "@prisma/client";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    conversation: {
      update: vi.fn()
    }
  }
}));

import { prisma } from "../src/lib/prisma.js";
import { DecisionEngine } from "../src/modules/decision/decision.engine.js";

describe("DecisionEngine", () => {
  const engine = new DecisionEngine();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks when bot is globally disabled", async () => {
    const result = await engine.evaluate({
      tenantId: "t1",
      botGlobalEnabled: false,
      conversationId: "c1",
      mode: ConversationMode.BOT,
      botResumeAt: null
    });
    expect(result).toEqual({ canRespond: false, reason: "bot_disabled" });
  });

  it("blocks when conversation is in human mode", async () => {
    const result = await engine.evaluate({
      tenantId: "t1",
      botGlobalEnabled: true,
      conversationId: "c1",
      mode: ConversationMode.HUMAN,
      botResumeAt: null
    });
    expect(result).toEqual({ canRespond: false, reason: "human_mode" });
  });

  it("resumes bot when botResumeAt has passed", async () => {
    const past = new Date(Date.now() - 60_000);
    const result = await engine.evaluate({
      tenantId: "t1",
      botGlobalEnabled: true,
      conversationId: "c1",
      mode: ConversationMode.HUMAN,
      botResumeAt: past
    });
    expect(result).toEqual({ canRespond: true, resumedFromSchedule: true });
    expect(prisma.conversation.update).toHaveBeenCalled();
  });

  it("allows response in bot mode", async () => {
    const result = await engine.evaluate({
      tenantId: "t1",
      botGlobalEnabled: true,
      conversationId: "c1",
      mode: ConversationMode.BOT,
      botResumeAt: null
    });
    expect(result).toEqual({ canRespond: true, resumedFromSchedule: false });
  });
});
