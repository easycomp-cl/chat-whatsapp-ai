# Informe — despliegue producción (histórico + estado)

> **Actualizado:** 2026-07-29  
> **Estado:** Código listo en rama `staging`. Deploy vía push → GitHub Action ECS.  
> **Checklist operativo:** [../deploy-produccion-checklist.md](../deploy-produccion-checklist.md)

---

## Resumen

La UI apunta a `https://api.conversai.easycomp.cl`. Si inbox responde **404**, producción está atrasada respecto al repo. El arranque del contenedor aplica migraciones Prisma (`start:prod`).

## Endpoints de este release

| Funcionalidad | Endpoint | Esperado post-deploy |
|---------------|----------|----------------------|
| Inbox optimizado | `GET /businesses/:id/conversations/inbox` | 200 |
| Conversaciones legacy | `GET /businesses/:id/conversations` | 200 |
| Perfil CRM | `GET/PATCH /businesses/:id/customers/:customerId` | 200 |
| Editar mensaje saliente | `PATCH /messages/:id` | **501** (cerrado) |
| Reenviar | `POST /messages/:id/resend` | 200/400 JSON |
| Delivery status | webhooks `statuses` → `DELIVERED`/`READ` | automático |

## Migraciones incluidas

1. `20260713010000_inbox_performance`
2. `20260728140000_customer_message_changes`
3. `20260728180000_whatsapp_delivery_delivered_read`
4. `20260728220000_customer_profile_team_roles`

## Cierre

Cuando inbox responda **200** en producción, marcar este ítem como desplegado y usar solo [deploy-produccion-checklist.md](../deploy-produccion-checklist.md) para el próximo release.
