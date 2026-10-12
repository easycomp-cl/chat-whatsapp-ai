import { ConversationMode, SenderType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn()
    },
    message: {
      create: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

import { prisma } from "../src/lib/prisma.js";
import {
  BOT_MODE_RESUMED_VISIBLE_TEXT,
  computeHumanModeUntil,
  HUMAN_MODE_TIMEOUT_MS,
  isHumanModeTimeoutDue,
  toHumanModeUntilIso,
  withHumanModeUntil
} from "../src/modules/conversations/human-mode-until.js";
import { buildSystemEvent, systemEventTitle } from "../src/modules/conversations/system-event-copy.js";
import { HandoffService } from "../src/modules/runtime/handoff.service.js";
import { HumanModeTimeoutService } from "../src/modules/runtime/human-mode-timeout.service.js";
import { WhatsAppClient } from "../src/modules/channel/whatsapp.client.js";

type ConvRow = {
  id: string;
  tenantId: string;
  customerId: string;
  mode: ConversationMode;
  botResumeAt: Date | null;
  updatedAt: Date;
  assignedAdminId: string | null;
  handoffReason: string | null;
  customer: { phoneNumber: string };
};

function createStore(initial: ConvRow) {
  const events: Array<{ kind?: string; title?: string }> = [];
  let row = { ...initial, customer: { ...initial.customer } };

  vi.mocked(prisma.conversation.findUnique).mockImplementation(async () => row as never);
  vi.mocked(prisma.conversation.findMany).mockImplementation(async ({ where }) => {
    if (row.mode !== ConversationMode.HUMAN) return [];
    const now = new Date();
    const due = isHumanModeTimeoutDue({
      botResumeAt: row.botResumeAt,
      fallbackActivityAt: row.updatedAt,
      now
    });
    if (!due) return [];
    if (where && typeof where === "object") {
      return [{ id: row.id }] as never;
    }
    return [{ id: row.id }] as never;
  });
  vi.mocked(prisma.conversation.updateMany).mockImplementation(async ({ where, data }) => {
    const modeOk = !where?.mode || row.mode === where.mode;
    const idOk = !where?.id || row.id === where.id;
    const resumeAtFilter = where?.botResumeAt as { lte?: Date } | null | undefined;
    const nullResume = where?.botResumeAt === null;
    const resumeOk = nullResume
      ? row.botResumeAt === null
      : !resumeAtFilter?.lte || (row.botResumeAt != null && row.botResumeAt <= resumeAtFilter.lte);
    if (!modeOk || !idOk || !resumeOk) {
      return { count: 0 } as never;
    }
    row = {
      ...row,
      mode: (data.mode as ConversationMode | undefined) ?? row.mode,
      botResumeAt:
        data.botResumeAt === undefined ? row.botResumeAt : (data.botResumeAt as Date | null),
      assignedAdminId:
        data.assignedAdminId === undefined ? row.assignedAdminId : (data.assignedAdminId as string | null),
      handoffReason:
        data.handoffReason === undefined ? row.handoffReason : (data.handoffReason as string | null)
    };
    return { count: 1 } as never;
  });
  vi.mocked(prisma.conversation.update).mockImplementation(async ({ data }) => {
    row = {
      ...row,
      mode: (data.mode as ConversationMode | undefined) ?? row.mode,
      botResumeAt:
        data.botResumeAt === undefined ? row.botResumeAt : (data.botResumeAt as Date | null),
      assignedAdminId:
        data.assignedAdminId === undefined ? row.assignedAdminId : (data.assignedAdminId as string | null),
      handoffReason:
        data.handoffReason === undefined ? row.handoffReason : (data.handoffReason as string | null)
    };
    return row as never;
  });
  vi.mocked(prisma.message.create).mockImplementation(async ({ data }) => {
    const payload = data.rawPayloadJson as { system_event?: { kind?: string; title?: string } };
    events.push({
      kind: payload?.system_event?.kind,
      title: payload?.system_event?.title
    });
    return { id: `evt-${events.length}`, senderType: SenderType.SYSTEM, ...data } as never;
  });
  vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
    if (typeof fn === "function") {
      return fn(prisma);
    }
    throw new Error("Expected callback transaction");
  });

  return {
    events,
    getRow: () => row,
    setRow: (next: Partial<ConvRow>) => {
      row = { ...row, ...next, customer: next.customer ?? row.customer };
    }
  };
}

const baseRow = (): ConvRow => ({
  id: "cmu1idzla000hzbimy3rzc639",
  tenantId: "cmu1app4e0000lkpjbajvnq8v",
  customerId: "cust-1",
  mode: ConversationMode.HUMAN,
  botResumeAt: new Date(Date.now() + 10 * 60 * 1000),
  updatedAt: new Date(),
  assignedAdminId: "admin-1",
  handoffReason: "user_requested_human",
  customer: { phoneNumber: "+56932546705" }
});

describe("human mode timeout helpers", () => {
  it("computes human_mode_until 30 minutes from now", () => {
    const from = new Date("2026-10-08T19:38:00.000Z");
    expect(computeHumanModeUntil(from).toISOString()).toBe("2026-10-08T20:08:00.000Z");
    expect(HUMAN_MODE_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it("aliases botResumeAt as human_mode_until only while HUMAN", () => {
    const until = new Date("2026-10-08T20:08:00.000Z");
    expect(toHumanModeUntilIso("HUMAN", until)).toBe(until.toISOString());
    expect(toHumanModeUntilIso("BOT", until)).toBeNull();
    expect(withHumanModeUntil({ mode: "HUMAN", botResumeAt: until }).human_mode_until).toBe(
      until.toISOString()
    );
    expect(withHumanModeUntil({ mode: "BOT", botResumeAt: until }).human_mode_until).toBeNull();
  });

  it("covers the three timeout cases from last activity", () => {
    const now = new Date("2026-10-08T20:00:00.000Z");
    const thirtyMinAgo = new Date(now.getTime() - HUMAN_MODE_TIMEOUT_MS);
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Case 1: advisor wrote, customer silent for 30 min.
    expect(
      isHumanModeTimeoutDue({
        botResumeAt: thirtyMinAgo,
        fallbackActivityAt: thirtyMinAgo,
        now
      })
    ).toBe(true);

    // Case 2: advisor took the chat and never wrote.
    expect(
      isHumanModeTimeoutDue({
        botResumeAt: thirtyMinAgo,
        fallbackActivityAt: thirtyMinAgo,
        now
      })
    ).toBe(true);

    // Case 3: customer wrote inside the window — countdown has not elapsed yet.
    expect(
      isHumanModeTimeoutDue({
        botResumeAt: new Date(tenMinAgo.getTime() + HUMAN_MODE_TIMEOUT_MS),
        fallbackActivityAt: tenMinAgo,
        now
      })
    ).toBe(false);

    // Case 3 elapsed: customer wrote, advisor never answered for 30 min.
    expect(
      isHumanModeTimeoutDue({
        botResumeAt: thirtyMinAgo,
        fallbackActivityAt: thirtyMinAgo,
        now
      })
    ).toBe(true);
  });

  it("uses updatedAt + 30 min when botResumeAt is null (legacy human chats)", () => {
    const now = new Date();
    expect(
      isHumanModeTimeoutDue({
        botResumeAt: null,
        fallbackActivityAt: new Date(now.getTime() - HUMAN_MODE_TIMEOUT_MS - 1_000),
        now
      })
    ).toBe(true);
    expect(
      isHumanModeTimeoutDue({
        botResumeAt: null,
        fallbackActivityAt: new Date(now.getTime() - 60_000),
        now
      })
    ).toBe(false);
  });
});

describe("system event bot_mode_resumed", () => {
  it("uses the frontend contract title and kind", () => {
    expect(systemEventTitle("bot_mode_resumed", "BOT")).toBe(BOT_MODE_RESUMED_VISIBLE_TEXT);
    const event = buildSystemEvent("bot_mode_resumed", "BOT", BOT_MODE_RESUMED_VISIBLE_TEXT, {
      source: "human_mode_timeout"
    });
    expect(event.kind).toBe("bot_mode_resumed");
    expect(event.actor).toBe("BOT");
    expect(event.title).toBe(BOT_MODE_RESUMED_VISIBLE_TEXT);
    expect(event.appearance).toBe("blue_pill");
  });
});

describe("HumanModeTimeoutService", () => {
  const service = new HumanModeTimeoutService();
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sendSpy = vi.spyOn(WhatsAppClient.prototype, "sendTextMessage").mockResolvedValue("wamid.fake");
  });

  it("case 1: resumes after the advisor wrote and the customer stayed silent for 30 min", async () => {
    const store = createStore({
      ...baseRow(),
      botResumeAt: new Date(Date.now() - 60_000)
    });

    const result = await service.resumeIfDue(store.getRow().id);
    expect(result).toEqual({ resumed: true, mode: ConversationMode.BOT });
    expect(store.getRow().mode).toBe(ConversationMode.BOT);
    expect(store.getRow().botResumeAt).toBeNull();
    expect(store.getRow().assignedAdminId).toBeNull();
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toEqual({
      kind: "bot_mode_resumed",
      title: BOT_MODE_RESUMED_VISIBLE_TEXT
    });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("case 2: resumes 30 min after take if the advisor never wrote", async () => {
    const tookAt = new Date(Date.now() - HUMAN_MODE_TIMEOUT_MS - 5_000);
    const store = createStore({
      ...baseRow(),
      botResumeAt: new Date(tookAt.getTime() + HUMAN_MODE_TIMEOUT_MS - 10_000),
      updatedAt: tookAt
    });
    store.setRow({ botResumeAt: new Date(Date.now() - 1_000) });

    const result = await service.resumeIfDue(store.getRow().id);
    expect(result.resumed).toBe(true);
    expect(store.events).toHaveLength(1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("case 3: keeps HUMAN and refreshes the countdown when the customer writes inside the window", async () => {
    const store = createStore(baseRow());
    const result = await service.resumeIfDue(store.getRow().id);
    expect(result).toEqual({ resumed: false, mode: ConversationMode.HUMAN });
    expect(store.events).toHaveLength(0);

    const refreshed = await service.refreshCountdown(store.getRow().id);
    expect(refreshed).not.toBeNull();
    expect(store.getRow().mode).toBe(ConversationMode.HUMAN);
    expect(store.getRow().botResumeAt?.getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("does not resume a chat the advisor re-took (future botResumeAt)", async () => {
    const store = createStore({
      ...baseRow(),
      botResumeAt: new Date(Date.now() + 20 * 60 * 1000)
    });
    const result = await service.resumeIfDue(store.getRow().id);
    expect(result).toEqual({ resumed: false, mode: ConversationMode.HUMAN });
    expect(store.events).toHaveLength(0);
    expect(store.getRow().mode).toBe(ConversationMode.HUMAN);
  });

  it("is idempotent: a second run does not emit another bot_mode_resumed", async () => {
    const store = createStore({
      ...baseRow(),
      botResumeAt: new Date(Date.now() - 60_000)
    });

    await service.resumeIfDue(store.getRow().id);
    await service.resumeIfDue(store.getRow().id);

    expect(store.events).toHaveLength(1);
    expect(store.getRow().mode).toBe(ConversationMode.BOT);
  });

  it("periodic job emits exactly one bot_mode_resumed and sends no WhatsApp message", async () => {
    const store = createStore({
      ...baseRow(),
      botResumeAt: new Date(Date.now() - 60_000)
    });

    const first = await service.processExpiredConversations();
    const second = await service.processExpiredConversations();

    expect(first).toEqual({ resumed: 1 });
    expect(second).toEqual({ resumed: 0 });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]?.kind).toBe("bot_mode_resumed");
    expect(vi.mocked(prisma.message.create).mock.calls[0]?.[0]?.data?.senderType).toBe(
      SenderType.SYSTEM
    );
    expect(sendSpy).not.toHaveBeenCalled();
    expect(store.getRow().botResumeAt).toBeNull();
  });

  it("does not flip a BOT conversation", async () => {
    const store = createStore({
      ...baseRow(),
      mode: ConversationMode.BOT,
      botResumeAt: null
    });
    const result = await service.resumeIfDue(store.getRow().id);
    expect(result).toEqual({ resumed: false, mode: ConversationMode.BOT });
    expect(store.events).toHaveLength(0);
  });
});

describe("manual mode toggle", () => {
  it("returns to BOT without emitting bot_mode_resumed", async () => {
    const store = createStore(baseRow());
    const handoff = new HandoffService();
    await handoff.enableBotMode(store.getRow().id);

    expect(store.getRow().mode).toBe(ConversationMode.BOT);
    expect(store.getRow().botResumeAt).toBeNull();
    expect(store.getRow().assignedAdminId).toBeNull();
    expect(store.events).toHaveLength(0);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
