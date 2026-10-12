import { ConversationMode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/decision/decision.engine.js", () => ({
  decisionEngine: {
    evaluate: vi.fn()
  }
}));

vi.mock("../src/modules/runtime/human-mode-timeout.service.js", () => ({
  humanModeTimeoutService: {
    refreshCountdown: vi.fn(),
    resumeIfDue: vi.fn()
  }
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    message: {
      findMany: vi.fn()
    }
  }
}));

import { decisionEngine } from "../src/modules/decision/decision.engine.js";
import { humanModeTimeoutService } from "../src/modules/runtime/human-mode-timeout.service.js";
import { ResponsePipelineService } from "../src/modules/runtime/response-pipeline.service.js";
import { prisma } from "../src/lib/prisma.js";

function pipelineInput(mode: "BOT" | "HUMAN", botResumeAt: Date | null) {
  return {
    tenant: {
      id: "t1",
      name: "EasyComp",
      botGlobalEnabled: true,
      defaultAiModel: "gpt-4o-mini",
      confidenceThreshold: 0.7,
      config: {
        botName: "Luna",
        botTone: "friendly",
        greetingMessage: "Hola",
        handoffMessage: "Te paso con un asesor"
      }
    },
    conversation: {
      id: "c1",
      mode,
      botResumeAt,
      channelPhoneNumber: "+56911111111"
    },
    customer: {
      id: "cust1",
      phoneNumber: "+56932546705",
      name: "Cliente"
    },
    incomingText: "Hola",
    channel: {
      phoneNumberId: "1375261048998481",
      accessToken: "token"
    }
  };
}

describe("inbound pipeline human-mode timeout", () => {
  const ingestBotMessage = vi.fn();
  const pipeline = new ResponsePipelineService({
    ingestBotMessage
  } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    ingestBotMessage.mockReset();
  });

  it("skips a customer message inside the 30 min window and refreshes the countdown", async () => {
    vi.mocked(decisionEngine.evaluate).mockResolvedValue({
      canRespond: false,
      reason: "human_mode"
    });
    vi.mocked(humanModeTimeoutService.refreshCountdown).mockResolvedValue(
      new Date(Date.now() + 30 * 60 * 1000)
    );

    const result = await pipeline.process(
      pipelineInput("HUMAN", new Date(Date.now() + 10 * 60 * 1000))
    );

    expect(result).toEqual({ mode: "human", skipped: true });
    expect(humanModeTimeoutService.refreshCountdown).toHaveBeenCalledWith("c1");
    expect(ingestBotMessage).not.toHaveBeenCalled();
  });

  it("does not skip after the window: the bot continues (no countdown refresh)", async () => {
    vi.mocked(decisionEngine.evaluate).mockResolvedValue({
      canRespond: true,
      resumedFromSchedule: true
    });
    vi.mocked(prisma.message.findMany).mockRejectedValue(new Error("stop-after-decision"));

    await expect(
      pipeline.process(pipelineInput("HUMAN", new Date(Date.now() - 60_000)))
    ).rejects.toThrow("stop-after-decision");

    expect(humanModeTimeoutService.refreshCountdown).not.toHaveBeenCalled();
    expect(ingestBotMessage).not.toHaveBeenCalled();
  });
});
