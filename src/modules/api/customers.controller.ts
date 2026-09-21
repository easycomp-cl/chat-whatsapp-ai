import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { setNoStore } from "../../lib/http-cache.js";
import { paramId } from "../../utils/params.js";
import {
  isHumanProfileUpdate,
  patchCustomerProfile,
  serializeCustomerProfile,
  type CustomerProfilePatch,
  type PatchCustomerProfileResult
} from "../customers/customer-profile.service.js";
import {
  formatProductGarageLabel,
  formatVehicleGarageLabel,
  readCustomerGarage,
  removeGarageProduct,
  removeGarageVehicle,
  writeCustomerGarage,
  type GarageProductBucket
} from "../customers/customer-garage.js";
import {
  ConversationNotForCustomerError,
  SystemEventPersistError,
  systemEventService
} from "../conversations/system-event.service.js";
import {
  buildSystemEvent,
  describeGarageRemovalEvent,
  describeProfileChanges
} from "../conversations/system-event-copy.js";

const invoiceTypeSchema = z.enum(["RECEIPT", "INVOICE", "NONE"]).nullable();
const billingSameSchema = z.enum(["NONE", "DELIVERY_1", "DELIVERY_2"]).nullable();
const actorNameSchema = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

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
    conversation_id: z.string().min(1).optional(),
    actor_name: actorNameSchema
  })
  .strict();

const deleteGarageItemSchema = z
  .object({
    conversation_id: z.string().min(1),
    actor_name: actorNameSchema
  })
  .strict();

const deleteGarageProductSchema = deleteGarageItemSchema.extend({
  bucket: z.enum(["consulted", "quoted", "purchased"]),
  identity: z.string().trim().min(1)
});

type ProfileDb = Prisma.TransactionClient | typeof prisma;

async function loadTenantConfig(tenantId: string) {
  const config = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: { configJson: true }
  });
  return config?.configJson;
}

function actorNamePayload(actorName?: string): Record<string, string> {
  const name = actorName?.trim();
  return name ? { actor_name: name } : {};
}

function optionalActorName(actorName?: string): { actorName: string } | Record<string, never> {
  const name = actorName?.trim();
  return name ? { actorName: name } : {};
}

async function assertConversationForCustomer(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      tenantId: input.tenantId,
      customerId: input.customerId
    },
    select: { id: true }
  });
  if (!conversation) {
    throw new ConversationNotForCustomerError();
  }
}

async function appendGarageRemovalEvent(
  input: {
    tenantId: string;
    conversationId: string;
    customerId: string;
    customerPhone: string;
    removed: string[];
    actorName?: string;
  },
  db: ProfileDb
) {
  const described = describeGarageRemovalEvent(input.removed);
  if (!described.body) {
    throw new SystemEventPersistError("El evento de sistema no tiene título o cuerpo");
  }
  await systemEventService.append(
    {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      customerPhone: input.customerPhone,
      event: buildSystemEvent("profile_updated", "HUMAN", described.body, {
        ...actorNamePayload(input.actorName),
        removed: described.removed,
        added: described.added,
        modified: described.modified,
        source: "inbox_garage_remove"
      })
    },
    db
  );
}

function replyCustomerWriteError(res: Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
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
      await assertConversationForCustomer({
        tenantId: businessId,
        customerId,
        conversationId: body.conversation_id
      });
    }

    const applyPatch = async (db?: Parameters<typeof patchCustomerProfile>[0]["db"]) => {
      const result = await patchCustomerProfile({
        tenantId: businessId,
        customerId,
        patch,
        ...(db ? { db } : {})
      });

      const hasProfileChanges = result.changes.length > 0;
      const hasGarageRemovals = result.removedGarageItems.length > 0;
      if (!humanUpdate || (!hasProfileChanges && !hasGarageRemovals)) {
        return result;
      }
      if (!body.conversation_id) {
        throw new ConversationNotForCustomerError(
          "conversation_id es obligatorio para registrar el cambio en el chat"
        );
      }

      if (hasGarageRemovals) {
        await appendGarageRemovalEvent(
          {
            tenantId: businessId,
            conversationId: body.conversation_id,
            customerId,
            customerPhone: result.customer.phoneNumber,
            removed: result.removedGarageItems,
            ...optionalActorName(body.actor_name)
          },
          db ?? prisma
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
            ...(body.actor_name
              ? actorNamePayload(body.actor_name)
              : tenant?.name
                ? { actor_name: tenant.name }
                : {}),
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
    replyCustomerWriteError(res, error, "Error al actualizar perfil");
  }
}

async function persistGarageRemoval(input: {
  req: Request;
  res: Response;
  removedLabels: string[];
  nextMetadata: Record<string, unknown>;
  conversationId: string;
  actorName?: string;
}) {
  const businessId = paramId(input.req, "businessId");
  const customerId = paramId(input.req, "customerId");

  await assertConversationForCustomer({
    tenantId: businessId,
    customerId,
    conversationId: input.conversationId
  });

  const updated = await prisma.$transaction(async (tx) => {
    const result: PatchCustomerProfileResult = await patchCustomerProfile({
      tenantId: businessId,
      customerId,
      patch: {
        profile_updated_by: "BUSINESS_ADMIN",
        profile_metadata: input.nextMetadata
      },
      db: tx
    });
    await appendGarageRemovalEvent(
      {
        tenantId: businessId,
        conversationId: input.conversationId,
        customerId,
        customerPhone: result.customer.phoneNumber,
        removed: input.removedLabels,
        ...optionalActorName(input.actorName)
      },
      tx
    );
    return result.customer;
  });

  const tenantConfigJson = await loadTenantConfig(businessId);
  setNoStore(input.res);
  input.res.json(await serializeCustomerProfile(updated, tenantConfigJson));
}

export async function deleteCustomerVehicleHandler(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const customerId = paramId(req, "customerId");
  const vehicleKey = paramId(req, "vehicleKey");

  let body: z.infer<typeof deleteGarageItemSchema>;
  try {
    body = deleteGarageItemSchema.parse(req.body ?? {});
  } catch (error) {
    res.status(400).json({ error: "Invalid request body", details: error });
    return;
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: businessId }
    });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const removal = removeGarageVehicle(readCustomerGarage(customer.profileMetadata), vehicleKey);
    if (!removal) {
      res.status(404).json({ error: "Vehicle not found" });
      return;
    }

    await persistGarageRemoval({
      req,
      res,
      conversationId: body.conversation_id,
      ...optionalActorName(body.actor_name),
      removedLabels: [`vehículo: ${formatVehicleGarageLabel(removal.removed)}`],
      nextMetadata: writeCustomerGarage(customer.profileMetadata, removal.garage)
    });
  } catch (error) {
    replyCustomerWriteError(res, error, "Error al eliminar el vehículo");
  }
}

export async function deleteCustomerProductHandler(req: Request, res: Response) {
  const businessId = paramId(req, "businessId");
  const customerId = paramId(req, "customerId");

  let body: z.infer<typeof deleteGarageProductSchema>;
  try {
    body = deleteGarageProductSchema.parse(req.body ?? {});
  } catch (error) {
    res.status(400).json({ error: "Invalid request body", details: error });
    return;
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: businessId }
    });
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const removal = removeGarageProduct(
      readCustomerGarage(customer.profileMetadata),
      body.bucket as GarageProductBucket,
      body.identity
    );
    if (!removal) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    await persistGarageRemoval({
      req,
      res,
      conversationId: body.conversation_id,
      ...optionalActorName(body.actor_name),
      removedLabels: [`producto: ${formatProductGarageLabel(removal.removed)}`],
      nextMetadata: writeCustomerGarage(customer.profileMetadata, removal.garage)
    });
  } catch (error) {
    replyCustomerWriteError(res, error, "Error al eliminar el producto");
  }
}
