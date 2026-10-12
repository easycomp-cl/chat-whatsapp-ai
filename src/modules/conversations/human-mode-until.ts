import { ConversationMode } from "@prisma/client";

export const HUMAN_MODE_TIMEOUT_MS = 30 * 60 * 1000;
export const BOT_MODE_RESUMED_VISIBLE_TEXT = "Volvió a modo BOT (30 min sin respuesta)";

export function computeHumanModeUntil(from: Date = new Date()): Date {
  return new Date(from.getTime() + HUMAN_MODE_TIMEOUT_MS);
}

export function toHumanModeUntilIso(
  mode: ConversationMode | string | null | undefined,
  botResumeAt: Date | string | null | undefined
): string | null {
  if (mode !== ConversationMode.HUMAN && mode !== "HUMAN") {
    return null;
  }
  if (!botResumeAt) {
    return null;
  }
  if (botResumeAt instanceof Date) {
    return Number.isNaN(botResumeAt.getTime()) ? null : botResumeAt.toISOString();
  }
  const parsed = new Date(botResumeAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function withHumanModeUntil<T extends {
  mode?: string | ConversationMode | null;
  botResumeAt?: Date | string | null;
}>(
  conversation: T
): T & { human_mode_until: string | null } {
  return {
    ...conversation,
    human_mode_until: toHumanModeUntilIso(conversation.mode, conversation.botResumeAt ?? null)
  };
}

export function isHumanModeTimeoutDue(input: {
  botResumeAt: Date | null;
  fallbackActivityAt: Date;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const deadline =
    input.botResumeAt ?? new Date(input.fallbackActivityAt.getTime() + HUMAN_MODE_TIMEOUT_MS);
  return deadline.getTime() <= now.getTime();
}
