# Especificación Bot API — Reacciones y Replies de WhatsApp

> **Audiencia:** equipo del Bot API / webhook de WhatsApp (backend).  
> **Consumidor:** dashboard `chat-whatsapp-ai-ui` (frontend ya preparado).  
> **Versión:** 1.0 — Junio 2026

---

## 1. Objetivo

Persistir y exponer en Supabase:

1. **Reacciones recibidas** — cuando un cliente reacciona (👍, ❤️, etc.) a un mensaje enviado por el negocio (bot o humano).
2. **Replies / mensajes citados** — cuando un cliente (o el negocio) responde citando otro mensaje del hilo.

El dashboard mostrará ambos en el chat con estilo WhatsApp. **Fase 1: solo reacciones recibidas del cliente** (no enviar reacciones desde el dashboard).

---

## 2. Webhooks de WhatsApp Cloud API

### 2.1 Reacción recibida

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "56912345678",
          "id": "wamid.REACTION_MSG_ID",
          "timestamp": "1717860000",
          "type": "reaction",
          "reaction": {
            "message_id": "wamid.TARGET_MSG_ID",
            "emoji": "👍"
          }
        }]
      }
    }]
  }]
}
```

**Reglas:**

| Caso | Acción |
|------|--------|
| `emoji` con valor (ej. `👍`) | Upsert reacción del cliente sobre el mensaje target |
| `emoji` vacío `""` | Eliminar reacción de ese cliente sobre ese mensaje (WhatsApp la quitó) |
| Target no encontrado por `externalId` | Log warning; opcional: cola de reconciliación |

**No crear** una fila en `Message` con `contentType = reaction` para el feed del chat. Las reacciones viven en tabla auxiliar o JSON agregado.

### 2.2 Mensaje con reply (context)

```json
{
  "type": "text",
  "text": { "body": "Sí, ese horario me sirve" },
  "context": {
    "from": "56912345678",
    "id": "wamid.QUOTED_MSG_ID",
    "referred_product": null
  }
}
```

WhatsApp no siempre envía el texto citado en el webhook. El bot debe:

1. Resolver `context.id` → mensaje interno vía `Message.externalId`.
2. Guardar `replyToMessageId` (UUID interno).
3. Rellenar `quotedText` con `contentText` del mensaje citado (truncar a ~300 chars si es largo).
4. Rellenar `quotedSenderType` (`CUSTOMER`, `BOT`, `HUMAN`).

Si el mensaje citado no existe aún, guardar `quotedText` como `"[Mensaje no disponible]"` y `replyToExternalId` para reconciliar después.

---

## 3. Cambios en base de datos (Prisma / `Message`)

### 3.1 Columnas nuevas en `Message`

| Columna Prisma | Tipo | Nullable | Descripción |
|----------------|------|----------|-------------|
| `replyToMessageId` | `String` | Sí | FK → `Message.id` del mensaje citado |
| `quotedText` | `String` | Sí | Preview del texto citado |
| `quotedSenderType` | `String` | Sí | `CUSTOMER` \| `BOT` \| `HUMAN` \| `SYSTEM` |
| `replyToExternalId` | `String` | Sí | `wamid` citado si aún no se resolvió FK interna |

Índice recomendado: `@@index([replyToMessageId])`

### 3.2 Tabla nueva `MessageReaction`

```prisma
model MessageReaction {
  id            String   @id @default(cuid())
  tenantId      String
  conversationId String
  messageId     String
  message       Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  emoji         String
  senderType    String   // CUSTOMER | HUMAN | BOT
  senderPhone   String?
  externalId    String?  @unique // wamid del evento reaction
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([messageId, senderPhone])
  @@index([messageId])
  @@index([conversationId])
}
```

**Upsert al recibir reaction:**

```txt
WHERE messageId = target.id AND senderPhone = customer.phone
SET emoji = payload.emoji, externalId = ..., updatedAt = now()
```

Si `emoji === ""` → `DELETE` esa fila.

---

## 4. Vista Supabase `public.messages` (dashboard)

Actualizar la vista que ya consume el frontend:

```sql
CREATE OR REPLACE VIEW public.messages AS
SELECT
  m.id,
  m."conversationId" AS conversation_id,
  m."tenantId" AS business_id,
  m."customerId" AS customer_id,
  m.direction,
  m."senderType" AS sender_type,
  m."senderPhone" AS sender_phone,
  m."receiverPhone" AS receiver_phone,
  m."contentText" AS content_text,
  m."contentType" AS content_type,
  m."externalId" AS external_id,
  m."aiGenerated" AS ai_generated,
  m."replyToMessageId" AS reply_to_message_id,
  m."quotedText" AS quoted_text,
  m."quotedSenderType" AS quoted_sender_type,
  m."createdAt" AS created_at,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'emoji', r.emoji,
          'sender_type', r."senderType",
          'sender_phone', r."senderPhone",
          'created_at', r."createdAt"
        )
        ORDER BY r."createdAt"
      )
      FROM public."MessageReaction" r
      WHERE r."messageId" = m.id
    ),
    '[]'::json
  ) AS reactions
FROM public."Message" m;
```

> Ejecutar esta migración **después** de que el bot despliegue las columnas y la tabla.

---

## 5. Contrato JSON que consume el frontend

Cada mensaje en `GET /conversations/:id` o query Supabase `messages`:

```json
{
  "id": "clx...",
  "conversation_id": "clx...",
  "business_id": "tenant_1",
  "direction": "INBOUND",
  "sender_type": "CUSTOMER",
  "content_text": "Sí, ese horario me sirve",
  "content_type": "text",
  "external_id": "wamid.xxx",
  "ai_generated": false,
  "created_at": "2026-06-08T12:00:00Z",
  "reply_to_message_id": "clx_parent",
  "quoted_text": "El pedido llega mañana entre 9 y 12",
  "quoted_sender_type": "BOT",
  "reactions": [
    {
      "emoji": "👍",
      "sender_type": "CUSTOMER",
      "sender_phone": "56912345678",
      "created_at": "2026-06-08T12:05:00Z"
    }
  ]
}
```

### Campos opcionales (retrocompatibles)

| Campo | Si falta | Comportamiento UI |
|-------|----------|-------------------|
| `reactions` | `[]` o ausente | Sin pill de reacciones |
| `reply_to_message_id` | `null` | Sin bloque citado |
| `quoted_text` | `null` | UI intenta resolver por `reply_to_message_id` en el hilo |

---

## 6. Envío de mensajes (reply saliente — fase 2 opcional)

Hoy el dashboard envía:

```json
POST /conversations/:id/messages
{ "text": "Hola", "agent_phone": "+569..." }
```

**Extensión futura** para que un asesor cite al responder:

```json
{
  "text": "Correcto, confirmado",
  "reply_to_message_id": "clx_internal_id"
}
```

El bot debe mapear a WhatsApp:

```json
{
  "messaging_product": "whatsapp",
  "to": "...",
  "type": "text",
  "context": { "message_id": "wamid.TARGET" },
  "text": { "body": "Correcto, confirmado" }
}
```

Y persistir `replyToMessageId` / `quotedText` en el mensaje OUTBOUND creado.

---

## 7. Reglas de negocio

1. **`lastMessageAt` de la conversación** — actualizar solo con mensajes reales (`contentType` ∈ `text`, `image`, `audio`, …), **no** con eventos de reacción.
2. **Realtime** — tras insert/update en `Message` o `MessageReaction`, el dashboard recibe el cambio vía Supabase Realtime (ya suscrito a `Message`). Habilitar Realtime también en `MessageReaction` o refrescar reacciones al actualizar el mensaje padre.
3. **Idempotencia** — usar `externalId` del webhook para evitar duplicar mensajes y reacciones.
4. **Privacidad** — el dashboard solo muestra reacciones **recibidas** (`senderType = CUSTOMER`) en fase 1.

---

## 8. Checklist de implementación (bot)

- [ ] Migración Prisma: columnas reply en `Message`
- [ ] Migración Prisma: modelo `MessageReaction`
- [ ] Handler webhook `type: reaction`
- [ ] Handler webhook `context` en mensajes entrantes
- [ ] Resolver `externalId` ↔ `wamid` al guardar
- [ ] Actualizar vista `public.messages` en Supabase
- [ ] `ALTER PUBLICATION supabase_realtime ADD TABLE "MessageReaction"` (opcional)
- [ ] Tests: reaction add, reaction remove, reply con context, reply sin mensaje padre en BD
- [ ] Verificar que `POST /messages` del bot sigue funcionando sin campos nuevos

---

## 9. Checklist frontend (dashboard — hecho en este repo)

- [x] Tipos `Message`, `MessageReaction` extendidos
- [x] UI bloque citado estilo WhatsApp
- [x] UI pill de reacciones bajo la burbuja
- [x] Resolución de cita por `reply_to_message_id` si falta `quoted_text`
- [ ] Activar en producción cuando la vista `messages` exponga los campos

---

## 10. Prueba manual end-to-end

1. Cliente envía: *"¿A qué hora llega?"*
2. Bot responde: *"Mañana 9-12 hrs"*
3. Cliente **reacciona 👍** al mensaje del bot → aparece pill 👍 bajo esa burbuja en el dashboard.
4. Cliente **responde citando** el mensaje del bot: *"Perfecto"* → se ve franja citada + texto.
5. Cliente **quita la reacción** → pill desaparece en el dashboard (Realtime o próximo poll).

---

## 11. Referencias

- [WhatsApp Cloud API — Reaction messages](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#reaction-messages)
- [WhatsApp Cloud API — Context / replies](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#messages-with-context)
