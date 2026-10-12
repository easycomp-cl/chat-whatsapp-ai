import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConversationMode } from "@prisma/client";

vi.mock("../src/modules/runtime/human-mode-timeout.service.js", () => ({
  humanModeTimeoutService: {
    resumeIfDue: vi.fn()
  }
}));

import { humanModeTimeoutService } from "../src/modules/runtime/human-mode-timeout.service.js";
import { DecisionEngine } from "../src/modules/decision/decision.engine.js";

describe("DecisionEngine", () => {
  const engine = new DecisionEngine();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks when bot is globally disabled and onboarding is required", async () => {
    const previous = process.env.ONBOARDING_REQUIRED;
    process.env.ONBOARDING_REQUIRED = "true";
    try {
      const result = await engine.evaluate({
        tenantId: "t1",
        botGlobalEnabled: false,
        conversationId: "c1",
        mode: ConversationMode.BOT,
        botResumeAt: null
      });
      expect(result).toEqual({ canRespond: false, reason: "bot_disabled" });
    } finally {
      if (previous === undefined) {
        delete process.env.ONBOARDING_REQUIRED;
      } else {
        process.env.ONBOARDING_REQUIRED = previous;
      }
    }
  });

  it("allows response when bot is disabled but onboarding is optional", async () => {
    const previous = process.env.ONBOARDING_REQUIRED;
    process.env.ONBOARDING_REQUIRED = "false";
    try {
      const result = await engine.evaluate({
        tenantId: "t1",
        botGlobalEnabled: false,
        conversationId: "c1",
        mode: ConversationMode.BOT,
        botResumeAt: null
      });
      expect(result).toEqual({ canRespond: true, resumedFromSchedule: false });
    } finally {
      if (previous === undefined) {
        delete process.env.ONBOARDING_REQUIRED;
      } else {
        process.env.ONBOARDING_REQUIRED = previous;
      }
    }
  });

  it("blocks when conversation is in human mode inside the 30 min window", async () => {
    vi.mocked(humanModeTimeoutService.resumeIfDue).mockResolvedValue({
      resumed: false,
      mode: ConversationMode.HUMAN
    });
    const result = await engine.evaluate({
      tenantId: "t1",
      botGlobalEnabled: true,
      conversationId: "c1",
      mode: ConversationMode.HUMAN,
      botResumeAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    expect(result).toEqual({ canRespond: false, reason: "human_mode" });
    expect(humanModeTimeoutService.resumeIfDue).toHaveBeenCalledWith("c1");
  });

  it("answers an inbound message after the 30 min window instead of skipping", async () => {
    vi.mocked(humanModeTimeoutService.resumeIfDue).mockResolvedValue({
      resumed: true,
      mode: ConversationMode.BOT
    });
    const past = new Date(Date.now() - 60_000);
    const result = await engine.evaluate({
      tenantId: "t1",
      botGlobalEnabled: true,
      conversationId: "c1",
      mode: ConversationMode.HUMAN,
      botResumeAt: past
    });
    expect(result).toEqual({ canRespond: true, resumedFromSchedule: true });
    expect(humanModeTimeoutService.resumeIfDue).toHaveBeenCalledWith("c1");
  });

  it("answers when another worker already flipped the chat back to BOT", async () => {
    vi.mocked(humanModeTimeoutService.resumeIfDue).mockResolvedValue({
      resumed: false,
      mode: ConversationMode.BOT
    });
    const result = await engine.evaluate({
      tenantId: "t1",
      botGlobalEnabled: true,
      conversationId: "c1",
      mode: ConversationMode.HUMAN,
      botResumeAt: new Date(Date.now() - 60_000)
    });
    expect(result).toEqual({ canRespond: true, resumedFromSchedule: false });
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
    expect(humanModeTimeoutService.resumeIfDue).not.toHaveBeenCalled();
  });
});
