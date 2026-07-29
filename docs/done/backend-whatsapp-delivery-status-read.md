# Pendiente backend — estados enviado / entregado / visto (WhatsApp)

> **Fecha:** 2026-07-28  
> **Estado:** ✅ **Implementado** — webhooks `statuses`, enum `DELIVERED`/`READ`, migración `20260728180000`

## Resumen

La UI ya distingue cuatro estados de entrega (`pending`, `sent`, `delivered`, `read`, `failed`) y escucha **Supabase Realtime** en la tabla `Message` para actualizar ticks sin recargar el chat.

**Hoy el backend solo persiste `PENDING`, `SENT` y `FAILED`.** Meta envía webhooks adicionales (`delivered`, `read`) que **no se procesan**. Por eso la UI no puede mostrar “visto” real hasta que backend:

1. Extienda el enum en BD.
2. Procese webhooks `statuses` de Meta.
3. Actualice `whatsappDeliveryStatus` en el mensaje outbound por `externalId` (wamid).

---

## Qué espera la UI

### Campo en mensaje (vista `public.messages`)

| Columna UI | Origen Prisma | Valores esperados (case-insensitive) |
|------------|---------------|--------------------------------------|
| `whatsapp_delivery_status` | `Message.whatsappDeliveryStatus` | `PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED` |

### Comportamiento visual (ya implementado en UI)

| Estado | Icono | Texto |
|--------|-------|-------|
| `pending` | Reloj | Enviando a WhatsApp… |
| `sent` | ✓ gris | Enviado |
| `delivered` | ✓✓ gris | Entregado |
| `read` | ✓✓ azul | Visto |
| `failed` | ⚠ | No entregado (+ Reenviar) |

Si solo hay `SENT` + `external_id`, la UI muestra **Enviado** (un tick gris), no “visto”.

### Tiempo real

- Publicación Realtime ya incluye `Message` (`supabase/migrations/20260608200000_realtime_messages.sql` en UI).
- Al hacer `UPDATE` en `Message.whatsappDeliveryStatus`, la UI parchea el mensaje en el chat (sin esperar poll).
- **Requisito:** el worker/API debe actualizar la fila en Postgres; la vista `messages` refleja el enum automáticamente (cast a `text`).

---

## Migración de base de datos (backend)

Ampliar enum Prisma `WhatsappDeliveryStatus`:

```prisma
enum WhatsappDeliveryStatus {
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
}
```

SQL sugerido:

```sql
ALTER TYPE "WhatsappDeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "WhatsappDeliveryStatus" ADD VALUE IF NOT EXISTS 'READ';
```

No requiere cambio en la vista `public.messages` del repo UI si ya expone `whatsappDeliveryStatus::text`.

---

## Webhooks Meta (Cloud API)

Documentación: [Status messages webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status)

### Payload relevante

Los estados salientes llegan en `entry[].changes[].value.statuses[]`, **no** en `messages[]`:

```json
{
  "statuses": [
    {
      "id": "wamid.HBg...",
      "status": "delivered",
      "timestamp": "1717888800",
      "recipient_id": "56912345678"
    }
  ]
}
```

Valores: `sent`, `delivered`, `read`, `failed`.

### Reglas de negocio

1. Buscar mensaje `OUTBOUND` por `externalId = statuses[].id` (wamid).
2. Mapear `status` → enum (`SENT`, `DELIVERED`, `READ`, `FAILED`).
3. **Solo avanzar** el estado (nunca bajar de `READ` a `DELIVERED`). Orden:  
   `PENDING` < `SENT` < `DELIVERED` < `READ`; `FAILED` solo desde `PENDING` o según política de reintentos.
4. Los eventos pueden llegar **desordenados** (p. ej. `read` antes de `delivered`); usar ranking, no orden de llegada.
5. Si el usuario desactivó lecturas en WhatsApp, puede no llegar `read` (solo `delivered`).

### Flujo sugerido en backend

```
receiveWebhook → normalize statuses → cola (BullMQ) → worker
  → MessageIngestService.applyOutboundDeliveryStatus({ externalMessageId, status })
  → prisma.message.update({ whatsappDeliveryStatus })
```

**Job id de cola:** debe ser único por evento, p. ej. `status:{wamid}:{status}:{timestamp}` (no reutilizar solo el wamid).

---

## Archivos de referencia (implementar en `chat-whatsapp-ai`)

El equipo backend puede implementar con su propio PR. Áreas a tocar:

| Área | Cambio |
|------|--------|
| `prisma/schema.prisma` | Enum + migración |
| `src/types/whatsapp.ts` | Tipo `NormalizedMessageStatus` (`kind: "status"`) |
| `src/modules/channel/whatsapp.schemas.ts` | Schema Zod `statuses[]` |
| `src/modules/channel/whatsapp.mapper.ts` | Parsear `statuses` además de `messages` |
| `src/modules/conversations/message-ingest.service.ts` | `applyOutboundDeliveryStatus` |
| `src/modules/router/delivery-status-router.service.ts` | Router nuevo (o equivalente) |
| `src/modules/queue/message.worker.ts` | Rama `event.kind === "status"` |
| `src/modules/queue/message.queue.ts` | `jobId` único para status |
| `src/utils/whatsapp-delivery-status.ts` | `mapMetaStatus`, `shouldUpgrade` |
| `tests/whatsapp.mapper.test.ts` | Test payload `statuses` |

---

## Qué ya hizo la UI (repo `chat-whatsapp-ai-ui`)

| Archivo | Rol |
|---------|-----|
| `src/lib/conversations/delivery-status.ts` | Resuelve y fusiona estados |
| `src/features/conversations/components/message-delivery-status.tsx` | Ticks y etiquetas |
| `src/lib/conversations/patch-realtime-message.ts` | Parche en Realtime |
| `src/features/conversations/hooks/use-live-conversation.ts` | UPDATE instantáneo + optimista `pending` |

---

## Cómo probar (E2E)

1. Aplicar migración enum en BD de staging/prod.
2. Desplegar backend + worker con parseo de `statuses`.
3. Desplegar UI.
4. Enviar mensaje saliente desde dashboard (modo humano).
5. Verificar progresión en UI cuando el cliente recibe/abre WhatsApp:
   - Enviado → Entregado → Visto (si el cliente tiene lecturas activadas).
6. En logs del worker, confirmar webhooks `delivered` / `read` y `UPDATE` en `Message`.

### Payload de prueba (curl al webhook de staging)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "<PHONE_NUMBER_ID>" },
        "statuses": [{
          "id": "<WAMID_DEL_MENSAJE_OUTBOUND>",
          "status": "read",
          "timestamp": "1717888800",
          "recipient_id": "56912345678"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

---

## Nota de proceso

Los cambios de backend **deben implementarse solo en `chat-whatsapp-ai`** vía PR del equipo backend. La UI documenta el contrato aquí y no debe modificar ese repositorio desde el proyecto frontend.
