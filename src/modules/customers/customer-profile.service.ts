import type { BillingSameAsDelivery, Customer, CustomerInvoiceType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { resolveCustomerDisplayName } from "../../utils/customer-display-name.js";
import { validateOptionalRut } from "../../utils/chilean-rut.js";
import { getCustomerReturningStats } from "./customer-returning.service.js";

const HUMAN_PROFILE_SOURCES = new Set([
  "BUSINESS_ADMIN",
  "SUPER_ADMIN",
  "HUMAN",
  "ADMIN"
]);

export type CustomerProfileJson = {
  id: string;
  business_id: string;
  phone_number: string;
  name: string | null;
  display_alias: string | null;
  display_name: string;
  email: string | null;
  tax_id: string | null;
  invoice_type: CustomerInvoiceType | null;
  company_name: string | null;
  business_activity: string | null;
  delivery1_line1: string | null;
  delivery1_line2: string | null;
  delivery1_commune: string | null;
  delivery1_region: string | null;
  delivery1_notes: string | null;
  delivery2_line1: string | null;
  delivery2_line2: string | null;
  delivery2_commune: string | null;
  delivery2_region: string | null;
  delivery2_notes: string | null;
  billing_line1: string | null;
  billing_line2: string | null;
  billing_commune: string | null;
  billing_region: string | null;
  billing_notes: string | null;
  billing_same_as_delivery: BillingSameAsDelivery | null;
  profile_metadata: unknown;
  profile_updated_at: string | null;
  profile_updated_by: string | null;
  first_seen_at: string;
  last_seen_at: string;
  inbound_message_count: number;
  closed_conversation_count: number;
  is_returning: boolean;
};

function trimOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isHumanProfileUpdate(source: string | undefined): boolean {
  if (!source) return true;
  return HUMAN_PROFILE_SOURCES.has(source.toUpperCase());
}

function shouldOverwriteField(input: {
  existing: unknown;
  incoming: unknown;
  profileUpdatedBy?: string;
}): boolean {
  if (input.incoming === undefined) {
    return false;
  }
  if (!isHumanProfileUpdate(input.profileUpdatedBy)) {
    return true;
  }
  const existingText = typeof input.existing === "string" ? input.existing.trim() : input.existing;
  if (existingText == null || existingText === "") {
    return true;
  }
  return false;
}

export async function serializeCustomerProfile(
  customer: Customer,
  tenantConfigJson?: unknown
): Promise<CustomerProfileJson> {
  const stats = await getCustomerReturningStats({ customer, tenantConfigJson });
  return {
    id: customer.id,
    business_id: customer.tenantId,
    phone_number: customer.phoneNumber,
    name: customer.name,
    display_alias: customer.displayAlias,
    display_name: resolveCustomerDisplayName(customer),
    email: customer.email,
    tax_id: customer.taxId,
    invoice_type: customer.invoiceType,
    company_name: customer.companyName,
    business_activity: customer.businessActivity,
    delivery1_line1: customer.delivery1Line1,
    delivery1_line2: customer.delivery1Line2,
    delivery1_commune: customer.delivery1Commune,
    delivery1_region: customer.delivery1Region,
    delivery1_notes: customer.delivery1Notes,
    delivery2_line1: customer.delivery2Line1,
    delivery2_line2: customer.delivery2Line2,
    delivery2_commune: customer.delivery2Commune,
    delivery2_region: customer.delivery2Region,
    delivery2_notes: customer.delivery2Notes,
    billing_line1: customer.billingLine1,
    billing_line2: customer.billingLine2,
    billing_commune: customer.billingCommune,
    billing_region: customer.billingRegion,
    billing_notes: customer.billingNotes,
    billing_same_as_delivery: customer.billingSameAsDelivery,
    profile_metadata: customer.profileMetadata,
    profile_updated_at: customer.profileUpdatedAt?.toISOString() ?? null,
    profile_updated_by: customer.profileUpdatedBy,
    first_seen_at: customer.firstSeenAt.toISOString(),
    last_seen_at: customer.lastSeenAt.toISOString(),
    inbound_message_count: stats.inbound_message_count,
    closed_conversation_count: stats.closed_conversation_count,
    is_returning: stats.is_returning
  };
}

export type CustomerProfilePatch = {
  display_alias?: string | null;
  email?: string | null;
  tax_id?: string | null;
  invoice_type?: CustomerInvoiceType | null;
  company_name?: string | null;
  business_activity?: string | null;
  delivery1_line1?: string | null;
  delivery1_line2?: string | null;
  delivery1_commune?: string | null;
  delivery1_region?: string | null;
  delivery1_notes?: string | null;
  delivery2_line1?: string | null;
  delivery2_line2?: string | null;
  delivery2_commune?: string | null;
  delivery2_region?: string | null;
  delivery2_notes?: string | null;
  billing_line1?: string | null;
  billing_line2?: string | null;
  billing_commune?: string | null;
  billing_region?: string | null;
  billing_notes?: string | null;
  billing_same_as_delivery?: BillingSameAsDelivery | null;
  profile_metadata?: Record<string, unknown> | null;
  profile_updated_by?: string;
};

export async function patchCustomerProfile(input: {
  tenantId: string;
  customerId: string;
  patch: CustomerProfilePatch;
}): Promise<Customer> {
  const existing = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId }
  });
  if (!existing) {
    throw new Error("Customer not found");
  }

  const updatedBy = input.patch.profile_updated_by ?? "BUSINESS_ADMIN";
  const data: Prisma.CustomerUpdateInput = {};

  if (input.patch.display_alias !== undefined) {
    if (
      shouldOverwriteField({
        existing: existing.displayAlias,
        incoming: input.patch.display_alias,
        profileUpdatedBy: updatedBy
      })
    ) {
      const alias = trimOptional(input.patch.display_alias ?? undefined);
      if (alias && alias.length > 80) {
        throw new Error("El alias no puede superar 80 caracteres");
      }
      data.displayAlias = alias;
    }
  }

  if (
    input.patch.email !== undefined &&
    shouldOverwriteField({
      existing: existing.email,
      incoming: input.patch.email,
      profileUpdatedBy: updatedBy
    })
  ) {
    data.email = trimOptional(input.patch.email ?? undefined);
  }

  if (
    input.patch.tax_id !== undefined &&
    shouldOverwriteField({
      existing: existing.taxId,
      incoming: input.patch.tax_id,
      profileUpdatedBy: updatedBy
    })
  ) {
    data.taxId = validateOptionalRut(input.patch.tax_id);
  }

  if (
    input.patch.invoice_type !== undefined &&
    shouldOverwriteField({
      existing: existing.invoiceType,
      incoming: input.patch.invoice_type,
      profileUpdatedBy: updatedBy
    })
  ) {
    data.invoiceType = input.patch.invoice_type;
  }

  if (
    input.patch.company_name !== undefined &&
    shouldOverwriteField({
      existing: existing.companyName,
      incoming: input.patch.company_name,
      profileUpdatedBy: updatedBy
    })
  ) {
    data.companyName = trimOptional(input.patch.company_name ?? undefined);
  }

  if (
    input.patch.business_activity !== undefined &&
    shouldOverwriteField({
      existing: existing.businessActivity,
      incoming: input.patch.business_activity,
      profileUpdatedBy: updatedBy
    })
  ) {
    data.businessActivity = trimOptional(input.patch.business_activity ?? undefined);
  }

  const stringFieldMap: Array<{
    patchKey: keyof CustomerProfilePatch;
    prismaKey: keyof Prisma.CustomerUpdateInput;
    existing: string | null;
  }> = [
    { patchKey: "delivery1_line1", prismaKey: "delivery1Line1", existing: existing.delivery1Line1 },
    { patchKey: "delivery1_line2", prismaKey: "delivery1Line2", existing: existing.delivery1Line2 },
    {
      patchKey: "delivery1_commune",
      prismaKey: "delivery1Commune",
      existing: existing.delivery1Commune
    },
    {
      patchKey: "delivery1_region",
      prismaKey: "delivery1Region",
      existing: existing.delivery1Region
    },
    { patchKey: "delivery1_notes", prismaKey: "delivery1Notes", existing: existing.delivery1Notes },
    { patchKey: "delivery2_line1", prismaKey: "delivery2Line1", existing: existing.delivery2Line1 },
    { patchKey: "delivery2_line2", prismaKey: "delivery2Line2", existing: existing.delivery2Line2 },
    {
      patchKey: "delivery2_commune",
      prismaKey: "delivery2Commune",
      existing: existing.delivery2Commune
    },
    {
      patchKey: "delivery2_region",
      prismaKey: "delivery2Region",
      existing: existing.delivery2Region
    },
    { patchKey: "delivery2_notes", prismaKey: "delivery2Notes", existing: existing.delivery2Notes },
    { patchKey: "billing_line1", prismaKey: "billingLine1", existing: existing.billingLine1 },
    { patchKey: "billing_line2", prismaKey: "billingLine2", existing: existing.billingLine2 },
    { patchKey: "billing_commune", prismaKey: "billingCommune", existing: existing.billingCommune },
    { patchKey: "billing_region", prismaKey: "billingRegion", existing: existing.billingRegion },
    { patchKey: "billing_notes", prismaKey: "billingNotes", existing: existing.billingNotes }
  ];

  for (const field of stringFieldMap) {
    const incoming = input.patch[field.patchKey];
    if (
      incoming !== undefined &&
      shouldOverwriteField({
        existing: field.existing,
        incoming,
        profileUpdatedBy: updatedBy
      })
    ) {
      (data as Record<string, unknown>)[field.prismaKey as string] = trimOptional(
        (incoming as string | null) ?? undefined
      );
    }
  }

  if (
    input.patch.billing_same_as_delivery !== undefined &&
    shouldOverwriteField({
      existing: existing.billingSameAsDelivery,
      incoming: input.patch.billing_same_as_delivery,
      profileUpdatedBy: updatedBy
    })
  ) {
    data.billingSameAsDelivery = input.patch.billing_same_as_delivery;
  }

  if (input.patch.profile_metadata !== undefined) {
    const merged = {
      ...asRecord(existing.profileMetadata),
      ...asRecord(input.patch.profile_metadata)
    };
    if (
      shouldOverwriteField({
        existing: existing.profileMetadata,
        incoming: merged,
        profileUpdatedBy: updatedBy
      })
    ) {
      data.profileMetadata = merged as Prisma.InputJsonValue;
    }
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  data.profileUpdatedAt = new Date();
  data.profileUpdatedBy = updatedBy;

  return prisma.customer.update({
    where: { id: existing.id },
    data
  });
}
