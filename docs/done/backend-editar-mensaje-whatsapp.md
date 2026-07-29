# Pendiente backend — editar mensajes de WhatsApp (asesor humano)

> **Fecha:** 2026-07-28  
> **Actualizado:** 2026-07-28 — **bloqueado por limitación de Meta**  
> **Repositorio UI:** `chat-whatsapp-ai-ui`  
> **Repositorio backend:** `chat-whatsapp-ai`  
> **Estado:** endpoint implementado pero **deshabilitado** (HTTP 501); lápiz oculto en UI

## Hallazgo crítico (2026-07-28)

La **WhatsApp Cloud API no documenta ni soporta** editar mensajes **salientes** enviados por la API.

- El OpenAPI oficial de `POST /{phone-number-id}/messages` **no incluye** el campo `edit`.
- Un payload con `type: text` + `edit.message_id` devuelve **HTTP 200** pero Graph API **ignora** `edit` y **envía un mensaje nuevo** (nuevo `wamid`).
- El webhook `type: edit` de Meta es solo para ediciones hechas **desde la app de WhatsApp del usuario**, no para mensajes business vía API.

**Prueba en producción (28-jul-2026):**

| Payload | Resultado |
|---------|-----------|
| `type: text` + `text.body` + `edit.message_id` | 200, **nuevo wamid** (duplicado en el chat del cliente) |
| Solo `edit` con `text` anidado (sin `type`) | 400 — `text` cannot be null |

**Decisión:** `PATCH /messages/:id` responde **501** y la UI oculta el botón editar hasta que Meta exponga soporte real.

### Webhooks entrantes (usuario edita/borra su mensaje) — implementado

Meta envía `type: edit` y `type: revoke` cuando el **cliente** modifica o elimina un mensaje en WhatsApp (ventana 15 min / 2 días). El backend ahora:

| Webhook | Acción en BD |
|---------|----------------|
| `edit` | `contentText` = nuevo texto; `contentTextSnapshot` = texto anterior (solo primera edición); `customerEditedAt` |
| `revoke` | `contentTextSnapshot` = texto borrado; `contentText` = placeholder; `customerRevokedAt` |

- No dispara respuesta del bot (igual que reacciones).
- Si el mensaje original no está en BD, se registra warning en logs.
- Archivos: `whatsapp.mapper.ts`, `message-update-router.service.ts`, `message-ingest.service.ts`.
- Migración: `20260728140000_customer_message_changes`.
- UI: ver `chat-whatsapp-ai-ui/docs/cambios-ui-mensajes-cliente-editados-revocados.md`.

## Resumen (diseño original — no aplicable hoy)

La UI del dashboard tenía previsto editar mensajes enviados por un **asesor humano** dentro de los **15 minutos**. Eso requería:

1. Validar que el mensaje es editable.
2. Llamar a la **WhatsApp Cloud API** para aplicar la edición.
3. Actualizar `contentText` del mensaje en base de datos.

El paso 2 **no es posible** con Cloud API; implementarlo enviaba un mensaje duplicado al cliente.

---

## Contrato que consume la UI

La UI llama al bot API con la misma autenticación que el resto de endpoints internos (`X-API-Key`).

### Request

```http
PATCH /messages/:messageId
X-API-Key: <BOT_API_SECRET>
Content-Type: application/json

{
  "text": "Texto corregido del mensaje"
}
```

### Response 200

Misma forma que `POST /messages/:id/resend`:

```json
{
  "id": "clx...",
  "conversation_id": "clx...",
  "external_id": "wamid.HBg...",
  "whatsapp_delivery_status": "SENT",
  "content_text": "Texto corregido del mensaje",
  "created_at": "2026-07-28T15:10:00.000Z"
}
```

> `external_id` **no cambia** al editar: WhatsApp modifica el mensaje existente identificado por ese `wamid`.

### Errores esperados

| HTTP | Cuándo | `error` sugerido |
|------|--------|------------------|
| 404 | Mensaje no existe | `"Message not found"` |
| 400 | No es saliente | `"Solo se pueden editar mensajes salientes"` |
| 400 | No es humano | `"Solo se pueden editar mensajes enviados por un asesor humano"` |
| 400 | No es texto | `"Solo se pueden editar mensajes de texto"` |
| 400 | Sin `externalId` | `"Este mensaje aún no fue entregado a WhatsApp"` |
| 400 | No está `SENT` | `"Solo se pueden editar mensajes entregados a WhatsApp"` |
| 400 | Pasaron >15 min | `"El plazo para editar este mensaje en WhatsApp ya expiró (15 minutos)"` |
| 400 | Texto igual al actual | `"El mensaje no tiene cambios"` |
| 400 | Sin canal activo | `"No active WhatsApp channel for this business"` |
| 502 | Error Graph API | Mensaje legible + `action` opcional |
| 503 | Token expirado | `token_expired: true` (igual que en envío/reenvío) |

La UI muestra `error` al usuario vía toast.

---

## Reglas de negocio (alineadas UI ↔ backend)

La UI solo muestra el botón editar si se cumple todo esto (ver `src/lib/conversations/delivery-status.ts`):

| Regla | Campo / condición |
|-------|-------------------|
| Dirección saliente | `direction = OUTBOUND` |
| Enviado por asesor | `senderType = HUMAN` |
| No generado por IA | `aiGenerated = false` |
| Solo texto | `contentType = TEXT` |
| Entregado a WhatsApp | `whatsappDeliveryStatus = SENT` y `externalId` presente |
| Dentro de ventana | `createdAt` ≤ 15 minutos |

El backend **debe revalidar** las mismas reglas aunque la UI ya las aplique.

Constante recomendada:

```ts
const WHATSAPP_EDIT_WINDOW_MS = 15 * 60 * 1000;
```

---

## Integración WhatsApp Cloud API

WhatsApp permite editar mensajes de texto usando el mismo endpoint de envío, con el bloque `edit`.

### Endpoint Graph

```http
POST https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{phone-number-id}/messages
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Payload

```json
{
  "messaging_product": "whatsapp",
  "type": "text",
  "text": {
    "body": "Texto corregido"
  },
  "edit": {
    "message_id": "wamid.HBgLM..."
  }
}
```

- `edit.message_id` = `Message.externalId` guardado al enviar el mensaje.
- No hace falta `to` ni `recipient_type` para la edición.
- WhatsApp rechaza ediciones fuera de los **15 minutos** o sobre tipos no editables.

### Implementación sugerida en backend

Agregar en `WhatsAppClient` (`src/modules/channel/whatsapp.client.ts`):

```ts
async editTextMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  externalMessageId: string;
  text: string;
}): Promise<void>
```

Reutilizar el mismo manejo de errores que `sendTextMessage` (`WhatsAppSendError`, token expirado, etc.).

---

## Cambios en el repo `chat-whatsapp-ai`

### 1. Router

`src/modules/api/router.ts`:

```ts
router.patch("/messages/:id", editOutboundMessage);
```

Junto al existente:

```ts
router.post("/messages/:id/resend", resendOutboundMessage);
```

### 2. Controller

`src/modules/api/messages.controller.ts`:

- Schema Zod: `{ text: z.string().min(1) }`
- Handler `editOutboundMessage`:
  - Cargar mensaje + conversación + canal activo (mismo patrón que `resendOutboundMessage`)
  - Validar reglas de negocio
  - Llamar `whatsAppClient.editTextMessage(...)`
  - Persistir nuevo texto en BD
  - Responder JSON snake_case (como el resto de la API interna)

### 3. Ingest / persistencia

`src/modules/conversations/message-ingest.service.ts`:

```ts
async updateMessageText(messageId: string, text: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { contentText: text }
  });
}
```

### 4. Base de datos

**No se requiere migración** para el MVP:

- Se actualiza `Message.contentText`.
- `externalId` se mantiene.
- `createdAt` no cambia (sigue siendo la hora del envío original).

Opcional futuro (no bloquea la UI actual):

- Campo `editedAt` en `Message` para mostrar etiqueta "editado" en dashboard.
- Webhook de Meta si en el futuro se sincronizan ediciones hechas fuera de la API.

---

## Referencia de implementación

Existe una implementación de referencia (no desplegada) en el entorno local del equipo UI, en el repo hermano `chat-whatsapp-ai`:

| Archivo | Cambio |
|---------|--------|
| `src/modules/channel/whatsapp.client.ts` | Método `editTextMessage` |
| `src/modules/api/messages.controller.ts` | Handler `editOutboundMessage` |
| `src/modules/api/router.ts` | Ruta `PATCH /messages/:id` |
| `src/modules/conversations/message-ingest.service.ts` | `updateMessageText` |

El equipo backend puede copiar/adaptar esa lógica o reimplementarla siguiendo este documento.

---

## Qué ya está listo en la UI (`chat-whatsapp-ai-ui`)

| Archivo | Rol |
|---------|-----|
| `src/lib/bot-api/client.ts` | `editMessage()` → `PATCH /messages/:id` |
| `src/lib/actions/app-actions.ts` | `editMessageAction` |
| `src/lib/conversations/delivery-status.ts` | `canEditWhatsappMessage`, ventana 15 min |
| `src/features/conversations/components/chat-message-bubble.tsx` | Botón lápiz en hover |
| `src/features/conversations/components/message-editable-text.tsx` | Editor inline + guardar |

La UI **no necesita cambios** una vez desplegado el backend con el contrato descrito.

---

## Checklist de deploy

- [ ] Implementar `editTextMessage` en `WhatsAppClient`
- [ ] Implementar `editOutboundMessage` + ruta `PATCH /messages/:id`
- [ ] Implementar `updateMessageText` en `MessageIngestService`
- [ ] Probar en staging con mensaje humano reciente (<15 min)
- [ ] Verificar que `externalId` del mensaje es el `wamid` correcto
- [ ] Desplegar backend (`api.conversai.easycomp.cl` o entorno correspondiente)
- [ ] Confirmar que `BOT_API_BASE_URL` y `BOT_API_SECRET` en Vercel apuntan al backend actualizado

---

## Cómo probar

### 1. cURL directo al bot API

```bash
curl -X PATCH "https://api.conversai.easycomp.cl/messages/<MESSAGE_ID>" \
  -H "X-API-Key: <BOT_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"text":"Mensaje corregido desde API"}'
```

Requisitos del mensaje de prueba:

- `senderType = HUMAN`, `direction = OUTBOUND`
- `whatsappDeliveryStatus = SENT`, `externalId` no nulo
- Enviado hace menos de 15 minutos

### 2. Flujo end-to-end en dashboard

1. Login en la app de conversaciones.
2. Poner conversación en **modo humano**.
3. Enviar un mensaje de texto al cliente.
4. Esperar estado **Entregado** (`external_id` presente).
5. Pasar el mouse sobre la burbuja → clic en **lápiz**.
6. Corregir texto → **Guardar**.
7. Verificar:
   - Toast de éxito en UI
   - Texto actualizado en el chat del dashboard
   - Texto actualizado en WhatsApp del cliente (con indicador "editado")

### 3. Casos negativos

- Mensaje con más de 15 minutos → 400 y sin lápiz en UI
- Mensaje del bot → sin lápiz en UI
- Mensaje fallido (`FAILED`) → sin lápiz; usar **Reenviar** (`POST /messages/:id/resend`)
- Mismo texto sin cambios → 400 `"El mensaje no tiene cambios"`

---

## Relación con otros endpoints

| Endpoint | Uso |
|----------|-----|
| `POST /conversations/:id/messages` | Enviar mensaje nuevo (humano/bot) |
| `POST /messages/:id/resend` | Reenviar mensaje fallido sin `externalId` |
| `PATCH /messages/:id` | **Nuevo** — editar mensaje humano ya entregado |

---

## Notas WhatsApp / Meta

- Solo mensajes de **texto** (no imágenes, audios, plantillas, etc.).
- Ventana de edición: **15 minutos** desde el envío original.
- El cliente ve el mensaje actualizado con marca de **editado**; no se envía notificación nueva.
- Mensajes enviados por API solo se editan por API (no desde el teléfono del negocio).
- Si Graph devuelve error por ventana expirada, propagar mensaje claro al dashboard.

---

## Contacto / seguimiento

Cuando el endpoint esté en producción, marcar este pendiente como resuelto y opcionalmente mover un resumen a `docs/cambios-ui-editar-mensaje-whatsapp.md` (patrón de `docs/cambios-ui-estado-entrega-whatsapp.md`).
