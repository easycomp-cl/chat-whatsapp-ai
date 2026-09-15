import type { WhatsappTemplateStatus } from "@prisma/client";

export type MetaMessageTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  quality?: string | null;
  rejectedReason?: string | null;
  components: unknown[];
};

export type CreateMessageTemplateResult = {
  id: string;
  status: string;
  category?: string;
};

export function mapMetaTemplateStatus(status: string | undefined): WhatsappTemplateStatus {
  const normalized = (status ?? "").toUpperCase();
  if (normalized === "APPROVED") return "APPROVED";
  if (normalized === "REJECTED") return "REJECTED";
  if (normalized === "PAUSED") return "PAUSED";
  if (normalized === "DISABLED" || normalized === "LOCKED") return "DISABLED";
  if (normalized === "PENDING" || normalized === "IN_APPEAL" || normalized === "FLAGGED") {
    return "PENDING";
  }
  if (normalized === "NOT_CREATED") return "NOT_CREATED";
  return "PENDING";
}

export function extractBodyPreview(components: unknown): string {
  if (!Array.isArray(components)) return "";
  for (const component of components) {
    if (!component || typeof component !== "object") continue;
    const row = component as { type?: string; text?: string };
    if (row.type?.toUpperCase() === "BODY" && typeof row.text === "string") {
      return row.text;
    }
  }
  return "";
}

export function extractVariableCount(text: string): number {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return 0;
  return new Set(matches).size;
}

export function isDuplicateTemplateError(message: string, code?: number): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already exists") ||
    lower.includes("already in use") ||
    lower.includes("duplicate") ||
    code === 2388024
  );
}
