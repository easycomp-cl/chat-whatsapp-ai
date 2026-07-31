# UI — Ticks de entrega WhatsApp (enviado / entregado / visto)

**Estado backend:** ✅ **Implementado** en `chat-whatsapp-ai` (migración `20260728180000`, worker + webhooks `statuses`).

El documento en `chat-whatsapp-ai-ui/docs/pending/to-backend/backend-whatsapp-delivery-status-read.md` está **desactualizado** (marca pendiente). Usar este archivo como contrato vigente.

---

## Resumen

Meta envía webhooks `delivered` y `read` para mensajes **salientes**. El backend los persiste en `Message.whatsappDeliveryStatus` y la UI debe reflejarlos **sin recargar** vía Supabase Realtime.

---

## Campo a consumir

| Fuente | Campo | Valores |
|--------|-------|---------|
| Vista `public.messages` | `whatsapp_delivery_status` | `PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED` |
| API `GET /conversations/:id` | `whatsapp_delivery_status` | Igual (snake_case en serializer) |

Comparar **case-insensitive** (`sent` === `SENT`).

### Errores de entrega (opcional, ya en backend)

| Campo API / vista | Uso UI |
|-------------------|--------|
| `whatsapp_delivery_error_code` | Código Meta (ej. `131026`) |
| `whatsapp_delivery_error_message` | Texto para tooltip en `FAILED` |

---

## Mapeo visual (UI ya implementada)

| `whatsapp_delivery_status` | Tick | Tooltip sugerido |
|----------------------------|------|------------------|
| `PENDING` | Reloj | Enviando a WhatsApp… |
| `SENT` | ✓ gris | Enviado |
| `DELIVERED` | ✓✓ gris | Entregado |
| `READ` | ✓✓ azul | Visto |
| `FAILED` | ⚠ | `whatsapp_delivery_error_message` o “No entregado” |

Solo mensajes `direction === 'OUTBOUND'` muestran ticks.

---

## Tiempo real (obligatorio)

1. Suscripción existente a `Message` (`postgres_changes`, evento `UPDATE`).
2. En el handler, si cambia `whatsapp_delivery_status` (o `whatsappDeliveryStatus` en payload crudo), parchear el mensaje en estado local (`patch-realtime-message.ts` / `use-live-conversation.ts`).
3. **No hace falta** llamar al backend para ticks; el worker actualiza Postgres y Realtime propaga.

### Payload Realtime típico

```json
{
  "id": "clx...",
  "whatsappDeliveryStatus": "READ"
}
```

La vista `messages` expone `whatsapp_delivery_status` como texto.

---

## Optimistic UI al enviar

Al crear mensaje desde dashboard:

1. Insertar optimista con `whatsapp_delivery_status: 'PENDING'`.
2. Tras `201` del POST, reemplazar con respuesta real (`SENT` + `external_id`).
3. Esperar `UPDATE` Realtime para `DELIVERED` / `READ`.

---

## Checklist si solo ven ✓ gris (SENT)

| Verificación | Acción |
|--------------|--------|
| Migración `20260728180000` aplicada en BD | `DELIVERED`/`READ` en enum |
| Worker BullMQ corriendo en ECS | Sin worker no se procesan `statuses` |
| Webhook Meta apunta al backend prod/staging | Mismo entorno que la BD de la UI |
| Cliente abrió chat en WhatsApp | `READ` requiere lecturas activadas del cliente |
| Vista `messages` incluye columna | `whatsapp_delivery_status` |

### Prueba manual

1. Enviar mensaje saliente desde dashboard.
2. En celular del cliente, recibir y **abrir** el chat.
3. En Supabase: `SELECT "whatsappDeliveryStatus" FROM "Message" WHERE id = '...'` → debe pasar a `DELIVERED` y luego `READ`.
4. UI debe actualizar ticks sin F5.

---

## Deploy backend relacionado

- `20260728180000_whatsapp_delivery_delivered_read`
- `20260731180000_whatsapp_delivery_error` (detalle en `FAILED`)

Ver `docs/done/backend-whatsapp-delivery-status-read.md` en este repo.
