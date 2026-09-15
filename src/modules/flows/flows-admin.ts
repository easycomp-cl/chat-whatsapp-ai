import { prisma } from "../../lib/prisma.js";
import { FlowHttpError } from "./flows.errors.js";

const FLOW_ADMIN_ROLES = new Set(["tenant_admin"]);

export async function assertFlowAdmin(tenantId: string, adminId: string) {
  const admin = await prisma.tenantAdmin.findFirst({
    where: { id: adminId, tenantId, isActive: true },
    select: { id: true, name: true, role: true, tenantId: true }
  });

  if (!admin) {
    throw new FlowHttpError("Admin no encontrado en este negocio", 404, "admin_not_found");
  }

  if (!FLOW_ADMIN_ROLES.has(admin.role)) {
    throw new FlowHttpError("Solo administradores pueden gestionar flujos", 403, "admin_required");
  }

  return admin;
}
