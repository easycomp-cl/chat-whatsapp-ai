import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireTenantDocument(
  req: Request,
  res: Response,
  documentId: string,
  businessId?: string
): Promise<{ id: string; tenantId: string; storagePath: string | null } | null> {
  const doc = await prisma.tenantDocument.findUnique({
    where: { id: documentId },
    select: { id: true, tenantId: true, storagePath: true }
  });
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return null;
  }
  if (businessId && doc.tenantId !== businessId) {
    res.status(403).json({ error: "Document does not belong to this business" });
    return null;
  }
  return doc;
}

export async function requireTenantFaq(
  req: Request,
  res: Response,
  faqId: string,
  businessId?: string
): Promise<{ id: string; tenantId: string } | null> {
  const faq = await prisma.tenantFaq.findUnique({
    where: { id: faqId },
    select: { id: true, tenantId: true }
  });
  if (!faq) {
    res.status(404).json({ error: "FAQ not found" });
    return null;
  }
  if (businessId && faq.tenantId !== businessId) {
    res.status(403).json({ error: "FAQ does not belong to this business" });
    return null;
  }
  return faq;
}

export async function requireTenantExists(businessId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: businessId },
    select: { id: true }
  });
  return Boolean(tenant);
}
