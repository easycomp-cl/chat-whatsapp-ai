import type { Prisma } from "@prisma/client";

export type InboundMediaIngestState = {
  failed: boolean;
  error: string | null;
};

export function readInboundMediaIngestState(rawPayloadJson: unknown): InboundMediaIngestState {
  if (!rawPayloadJson || typeof rawPayloadJson !== "object") {
    return { failed: false, error: null };
  }

  const inbound = (rawPayloadJson as { inbound?: { media_ingest_failed?: unknown; media_ingest_error?: unknown } })
    .inbound;

  return {
    failed: inbound?.media_ingest_failed === true,
    error: typeof inbound?.media_ingest_error === "string" ? inbound.media_ingest_error : null
  };
}

export function mergeInboundMediaIngestFailed(
  rawPayloadJson: unknown,
  errorMessage: string
): Prisma.InputJsonValue {
  const base =
    rawPayloadJson && typeof rawPayloadJson === "object" && !Array.isArray(rawPayloadJson)
      ? { ...(rawPayloadJson as Record<string, unknown>) }
      : {};

  const inbound =
    base.inbound && typeof base.inbound === "object" && !Array.isArray(base.inbound)
      ? { ...(base.inbound as Record<string, unknown>) }
      : {};

  inbound.media_ingest_failed = true;
  inbound.media_ingest_error = errorMessage;

  return {
    ...base,
    inbound
  } as Prisma.InputJsonValue;
}

export function mergeInboundMediaIngestSucceeded(rawPayloadJson: unknown): Prisma.InputJsonValue {
  const base =
    rawPayloadJson && typeof rawPayloadJson === "object" && !Array.isArray(rawPayloadJson)
      ? { ...(rawPayloadJson as Record<string, unknown>) }
      : {};

  if (!base.inbound || typeof base.inbound !== "object" || Array.isArray(base.inbound)) {
    return base as Prisma.InputJsonValue;
  }

  const inbound = { ...(base.inbound as Record<string, unknown>) };
  delete inbound.media_ingest_failed;
  delete inbound.media_ingest_error;

  if (Object.keys(inbound).length === 0) {
    const { inbound: _removed, ...rest } = base;
    return rest as Prisma.InputJsonValue;
  }

  return {
    ...base,
    inbound
  } as Prisma.InputJsonValue;
}
