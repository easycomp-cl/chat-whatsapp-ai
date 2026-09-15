# Backend — implementado o cerrado

> Specs que **ya no requieren trabajo** del equipo backend, o se cerraron con decisión de producto.

| Documento | Estado | Notas |
|-----------|--------|-------|
| [backend-editar-mensaje-whatsapp.md](./backend-editar-mensaje-whatsapp.md) | **Cerrado** | `PATCH /messages/:id` → **501** (Meta no edita in-place). Webhooks `edit`/`revoke` del **cliente** sí implementados. |
| [backend-whatsapp-delivery-status-read.md](./backend-whatsapp-delivery-status-read.md) | **Implementado** | Enum `DELIVERED`/`READ`, webhooks `statuses`, `DeliveryStatusRouterService`. Migración `20260728180000`. |
| [backend-deploy-pendiente-produccion.md](./backend-deploy-pendiente-produccion.md) | **Código listo** | Ver checklist operativo: [../deploy-produccion-checklist.md](../deploy-produccion-checklist.md). Push a `staging` → ECS. |
| [backend-team-roles-collaborador.md](./backend-team-roles-collaborador.md) | **Implementado** | `TenantAdmin.role` default `collaborator`; alias `agent` en API. Enum `profiles.role` en Supabase es del repo UI. |
| [backend-customer-profile-crm.md](./backend-customer-profile-crm.md) | **Implementado** | `GET/PATCH /businesses/:id/customers/:customerId`, campos CRM en `Customer`, RUT validado. |

Al cerrar un ítem de [../pending/](../pending/), moverlo aquí y actualizar [../pending/README.md](../pending/README.md).
