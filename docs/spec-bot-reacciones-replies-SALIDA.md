# Spec de salida — Reacciones y Replies (implementado)

> **Estado:** implementado en `chat-whatsapp-ai` + vista Supabase en `chat-whatsapp-ai-ui`  
> **Entrada:** [spec-bot-reacciones-replies.md](./spec-bot-reacciones-replies.md)  
> **Versión:** 1.0 — Junio 2026

---

## 1. Resumen de lo implementado

| Ítem | Estado | Ubicación |
|------|--------|-----------|
| Columnas reply en `Message` | ✅ | `prisma/migrations/20260609_reactions_replies/` |
| Tabla `MessageReaction` | ✅ | mismo migration |
| Webhook `type: reaction` | ✅ | `whatsapp.mapper.ts`, `reaction-router.service.ts` |
| Webhook `context` (reply citado) | ✅ | `message-ingest.service.ts`, `resolve-reply-context.ts` |
| `externalId` en mensajes OUTBOUND | ✅ | `whatsapp.client.ts` + `message-router.service.ts` |
| Vista `public.messages` extendida | ✅ | `chat-whatsapp-ai-ui/supabase/migrations/20260609100000_*` |
| Realtime `MessageReaction` | ✅ | misma migración Supabase + hook `use-live-conversation.ts` |
| `POST /messages` con reply (fase 2) | ✅ | `messages.controller.ts` acepta `reply_to_message_id` |
| Tests | ✅ | `tests/whatsapp.mapper.test.ts`, `tests/quoted-text.test.ts` |

---

## 2. Cómo leer mensajes desde el frontend

### Fuente recomendada: Supabase `messages`

```typescript
const { data } = await supabase
  .from("messages")
  .select("*")
  .eq("conversation_id", conversationId)
  .order("created_at", { ascending: true });
```

Cada fila incluye los campos nuevos. **No hace falta join manual** — `reactions` viene como JSON agregado.

### Normalización en el UI (ya existente)

Usar `normalizeMessages()` de `@/lib/conversations/message-display`:

```typescript
import { normalizeMessages } from "@/lib/conversations/message-display";

const messages = normalizeMessages(data ?? []);
```

Eso parsea `reactions` si viene como string JSON y filtra mensajes `content_type === "reaction"` (no se crean en el feed).

---

## 3. Contrato JSON por mensaje

```json
{
  "id": "clx...",
  "conversation_id": "clx...",
  "business_id": "tenant-panaderia-sol",
  "customer_id": "clx...",
  "direction": "INBOUND",
  "sender_type": "CUSTOMER",
  "sender_phone": "56940414977",
  "receiver_phone": "+56940414977",
  "content_text": "Sí, ese horario me sirve",
  "content_type": "TEXT",
  "external_id": "wamid.xxx",
  "ai_generated": false,
  "created_at": "2026-06-09T00:00:00.000Z",
  "reply_to_message_id": "clx_parent",
  "quoted_text": "Mañana entre 9 y 12 hrs",
  "quoted_sender_type": "BOT",
  "reactions": [
    {
      "emoji": "👍",
      "sender_type": "CUSTOMER",
      "sender_phone": "56940414977",
      "created_at": "2026-06-09T00:05:00.000Z"
    }
  ]
}
```

### Campos nuevos

| Campo (snake_case) | Tipo | Nullable | Descripción |
|--------------------|------|----------|-------------|
| `reply_to_message_id` | `string` | sí | ID interno del mensaje citado |
| `quoted_text` | `string` | sí | Preview del citado (máx. ~300 chars) o `"[Mensaje no disponible]"` |
| `quoted_sender_type` | `string` | sí | `CUSTOMER` \| `BOT` \| `HUMAN` \| `SYSTEM` |
| `reactions` | `array` | no | Siempre array (vacío `[]` si no hay reacciones) |

### Elemento de `reactions[]`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `emoji` | `string` | Emoji Unicode (`👍`, `❤️`, …) |
| `sender_type` | `string` | Fase 1: solo `CUSTOMER` entrante |
| `sender_phone` | `string?` | Teléfono del que reaccionó |
| `created_at` | `string` | ISO timestamp |

---

## 4. Comportamiento UI esperado (ya soportado en `chat-whatsapp-ai-ui`)

| Caso | Qué mostrar |
|------|-------------|
| `reactions.length > 0` | Pill bajo la burbuja (`MessageReactions`, filtra `sender_type === "CUSTOMER"`) |
| `quoted_text` o `reply_to_message_id` | Bloque citado (`MessageQuotedBlock`) |
| `quoted_text` null + `reply_to_message_id` set | UI resuelve texto del padre en el hilo (`resolveQuotedText`) |
| `reactions` ausente / `null` | Tratar como `[]` |

---

## 5. Realtime

El dashboard debe refrescar el hilo cuando:

| Tabla | Eventos | Uso |
|-------|---------|-----|
| `Message` | `INSERT` | Mensaje nuevo |
| `Conversation` | `UPDATE` | Cambio modo / handoff |
| `MessageReaction` | `INSERT`, `UPDATE`, `DELETE` | Pill de reacción aparece/desaparece |

Hook actualizado: `use-live-conversation.ts` ya escucha `MessageReaction` filtrado por `conversationId`.

**Polling de respaldo:** 2.5 s (sin cambios).

---

## 6. Bot API (alternativa a Supabase)

### `GET /conversations/:id`

Incluye `messages[]` con campos Prisma en **camelCase** (`replyToMessageId`, `quotedText`, …).  
El dashboard **no debe usar esto** para el chat — usar la vista Supabase en snake_case.

### `POST /conversations/:id/messages`

**Sin cambios obligatorios** — sigue funcionando con:

```json
{ "text": "Hola", "agent_phone": "+569..." }
```

**Extensión opcional (fase 2 activa):**

```json
{
  "text": "Correcto, confirmado",
  "reply_to_message_id": "clx_internal_id"
}
```

Respuesta `201`:

```json
{
  "id": "clx...",
  "conversation_id": "clx...",
  "direction": "OUTBOUND",
  "sender_type": "HUMAN",
  "content_text": "Correcto, confirmado",
  "external_id": "wamid.out",
  "reply_to_message_id": "clx_internal_id",
  "quoted_text": "Texto citado…",
  "quoted_sender_type": "CUSTOMER",
  "created_at": "..."
}
```

---

## 7. Reglas de negocio aplicadas

1. **Reacciones no actualizan `lastMessageAt`** — no pasan por `ingestCustomerMessage`.
2. **No se crean filas `Message` con `contentType = reaction`** — tabla auxiliar `MessageReaction`.
3. **Idempotencia mensajes** — `externalId` del webhook evita duplicar INBOUND.
4. **Idempotencia reacciones** — `@@unique([messageId, senderPhone])` + upsert; `emoji: ""` → delete.
5. **OUTBOUND guarda `externalId`** — necesario para que reacciones del cliente encuentren el target por `wamid`.
6. **Target de reacción no encontrado** — log warning, no falla el worker.

---

## 8. Despliegue / migraciones

### Bot (`chat-whatsapp-ai`)

```bash
npx prisma migrate deploy
npm run dev
```

### Dashboard (`chat-whatsapp-ai-ui`)

```bash
# Supabase local — ya aplicada si usas docker; si no:
# Ejecutar supabase/migrations/20260609100000_messages_reactions_replies.sql
npm run dev
```

### Verificar vista

```sql
SELECT id, reply_to_message_id, quoted_text, reactions
FROM public.messages
LIMIT 3;
```

---

## 9. Prueba manual E2E

1. Bot responde a un cliente (mensaje OUTBOUND con `external_id` en BD).
2. Cliente reacciona 👍 en WhatsApp al mensaje del bot.
3. Dashboard: pill 👍 bajo la burbuja del bot (Realtime o poll ≤ 2.5 s).
4. Cliente responde **citando** ese mensaje.
5. Dashboard: bloque citado + texto nuevo.
6. Cliente quita la reacción → pill desaparece.

---

## 10. Archivos tocados (referencia rápida)

**Bot**

- `prisma/schema.prisma`
- `prisma/migrations/20260609_reactions_replies/migration.sql`
- `src/types/whatsapp.ts`
- `src/modules/channel/whatsapp.schemas.ts`
- `src/modules/channel/whatsapp.mapper.ts`
- `src/modules/channel/whatsapp.controller.ts`
- `src/modules/channel/whatsapp.client.ts`
- `src/modules/conversations/message-ingest.service.ts`
- `src/modules/conversations/reaction-ingest.service.ts`
- `src/modules/conversations/resolve-reply-context.ts`
- `src/modules/router/reaction-router.service.ts`
- `src/modules/router/message-router.service.ts`
- `src/modules/queue/message.queue.ts`
- `src/modules/queue/message.worker.ts`
- `src/modules/api/messages.controller.ts`
- `src/utils/quoted-text.ts`

**UI**

- `supabase/migrations/20260609100000_messages_reactions_replies.sql`
- `src/features/conversations/hooks/use-live-conversation.ts` (Realtime reacciones)
