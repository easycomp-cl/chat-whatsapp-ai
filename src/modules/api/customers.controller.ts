import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { setNoStore } from "../../lib/http-cache.js";
import { paramId } from "../../utils/params.js";
import {
  isHumanProfileUpdate,
  patchCustomerProfile,
  serializeCustomerProfile,
  type CustomerProfilePatch
} from "../customers/customer-profile.service.js";
import {
  ConversationNotForCustomerError,
  SystemEventPersistError,
  systemEventService
} from "../conversations/system-event.service.js";
import { buildSystemEvent, describeProfileChanges } from "../conversations/system-event-copy.js";

const invoiceTypeSchema = z.enum(["RECEIPT", "INVOICE", "NONE"]).nullable();
const billingSameSchema = z.enum(["NONE", "DELIVERY_1", "DELIVERY_2"]).nullable();

const patchCustomerSchema = z
  .object({
    display_alias: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    tax_id: z.string().nullable().optional(),
    invoice_type: invoiceTypeSchema.optional(),
    company_name: z.string().nullable().optional(),
    business_activity: z.string().nullable().optional(),
    delivery1_line1: z.string().nullable().optional(),
    delivery1_line2: z.string().nullable().optional(),
    delivery1_commune: z.string().nullable().optional(),
    delivery1_region: z.string().nullable().optional(),
    delivery1_notes: z.string().nullable().optional(),
    delivery2_line1: z.string().nullable().optional(),
    delivery2_line2: z.string().nullable().optional(),
    delivery2_commune: z.string().nullable().optional(),
    delivery2_region: z.string().nullable().optional(),
    delivery2_notes: z.string().nullable().optional(),
    billing_line1: z.string().nullable().optional(),
    billing_line2: z.string().nullable().optional(),
    billing_commune: z.string().nullable().optional(),
    billing_region: z.string().nullable().optional(),
    billing_notes: z.string().nullable().optional(),
    billing_same_as_delivery: billingSameSchema.optional(),
    profile_metadata: z.record(z.unknown()).nullable().optional(),
    profile_updated_by: z.string().optional(),
    conversation_id: z.string().min(1).optional()
  })
  .strict();

async function loadTenantConfig(tenantId: string) {
  const config = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: { configJson: true }
  });
  return config?.configJson;
}

export async function getCustomerProfile(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const customerId = paramId(req, "customerId");

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: businessId }
  });
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const tenantConfigJson = await loadTenantConfig(businessId);
  setNoStore(res);
  res.json(await serializeCustomerProfile(customer, tenantConfigJson));
}

export async function patchCustomerProfileHandler(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const customerId = paramId(req, "customerId");

  let body: z.infer<typeof patchCustomerSchema>;
  try {
    body = patchCustomerSchema.parse(req.body);
  } catch (error) {
    res.status(400).json({ error: "Invalid request body", details: error });
    return;
  }

  try {
    const patch: CustomerProfilePatch = {};
    if (body.display_alias !== undefined) patch.display_alias = body.display_alias;
    if (body.email !== undefined) patch.email = body.email;
    if (body.tax_id !== undefined) patch.tax_id = body.tax_id;
    if (body.invoice_type !== undefined) patch.invoice_type = body.invoice_type;
    if (body.company_name !== undefined) patch.company_name = body.company_name;
    if (body.business_activity !== undefined) patch.business_activity = body.business_activity;
    if (body.delivery1_line1 !== undefined) patch.delivery1_line1 = body.delivery1_line1;
    if (body.delivery1_line2 !== undefined) patch.delivery1_line2 = body.delivery1_line2;
    if (body.delivery1_commune !== undefined) patch.delivery1_commune = body.delivery1_commune;
    if (body.delivery1_region !== undefined) patch.delivery1_region = body.delivery1_region;
    if (body.delivery1_notes !== undefined) patch.delivery1_notes = body.delivery1_notes;
    if (body.delivery2_line1 !== undefined) patch.delivery2_line1 = body.delivery2_line1;
    if (body.delivery2_line2 !== undefined) patch.delivery2_line2 = body.delivery2_line2;
    if (body.delivery2_commune !== undefined) patch.delivery2_commune = body.delivery2_commune;
    if (body.delivery2_region !== undefined) patch.delivery2_region = body.delivery2_region;
    if (body.delivery2_notes !== undefined) patch.delivery2_notes = body.delivery2_notes;
    if (body.billing_line1 !== undefined) patch.billing_line1 = body.billing_line1;
    if (body.billing_line2 !== undefined) patch.billing_line2 = body.billing_line2;
    if (body.billing_commune !== undefined) patch.billing_commune = body.billing_commune;
    if (body.billing_region !== undefined) patch.billing_region = body.billing_region;
    if (body.billing_notes !== undefined) patch.billing_notes = body.billing_notes;
    if (body.billing_same_as_delivery !== undefined) {
      patch.billing_same_as_delivery = body.billing_same_as_delivery;
    }
    if (body.profile_metadata !== undefined) {
      patch.profile_metadata = body.profile_metadata ?? {};
    }
    if (body.profile_updated_by !== undefined) patch.profile_updated_by = body.profile_updated_by;

    const humanUpdate = isHumanProfileUpdate(body.profile_updated_by ?? "BUSINESS_ADMIN");
    const tenant = humanUpdate
      ? await prisma.tenant.findUnique({
          where: { id: businessId },
          select: { name: true }
        })
      : null;
    if (humanUpdate && body.conversation_id) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: body.conversation_id,
          tenantId: businessId,
          customerId
        },
        select: { id: true }
      });
      if (!conversation) {
        throw new ConversationNotForCustomerError();
      }
    }

    const applyPatch = async (db?: Parameters<typeof patchCustomerProfile>[0]["db"]) => {
      const result = await patchCustomerProfile({
        tenantId: businessId,
        customerId,
        patch,
        ...(db ? { db } : {})
      });

      if (!humanUpdate || result.changes.length === 0) {
        return result;
      }
      if (!body.conversation_id) {
        throw new ConversationNotForCustomerError(
          "conversation_id es obligatorio para registrar el cambio en el chat"
        );
      }

      const described = describeProfileChanges(result.changes);
      if (!described.body) {
        return result;
      }

      await systemEventService.append(
        {
          tenantId: businessId,
          conversationId: body.conversation_id,
          customerId,
          customerPhone: result.customer.phoneNumber,
          event: buildSystemEvent("profile_updated", "HUMAN", described.body, {
            ...(tenant?.name ? { actor_name: tenant.name } : {}),
            added: described.added,
            modified: described.modified,
            source: "inbox_profile_patch"
          })
        },
        db ?? prisma
      );
      return result;
    };

    const { customer: updated } = humanUpdate
      ? await prisma.$transaction((tx) => applyPatch(tx))
      : await applyPatch();

    const tenantConfigJson = await loadTenantConfig(businessId);
    setNoStore(res);
    res.json(await serializeCustomerProfile(updated, tenantConfigJson));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar perfil";
    if (message === "Customer not found") {
      res.status(404).json({ error: message });
      return;
    }
    if (error instanceof ConversationNotForCustomerError) {
      res.status(400).json({ error: message, code: "conversation_not_for_customer" });
      return;
    }
    if (error instanceof SystemEventPersistError) {
      res.status(500).json({ error: message, code: "system_event_persist_failed" });
      return;
    }
    if (message === "RUT inválido" || message.includes("alias")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
}
