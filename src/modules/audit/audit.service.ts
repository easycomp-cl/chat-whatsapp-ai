import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export class AuditService {
  async log(input: {
    tenantId: string;
    actorType: "system" | "admin" | "bot";
    actorRef?: string | null;
    eventType: string;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorType: input.actorType,
        actorRef: input.actorRef ?? null,
        eventType: input.eventType,
        payloadJson: input.payload ?? {}
      }
    });
  }
}
