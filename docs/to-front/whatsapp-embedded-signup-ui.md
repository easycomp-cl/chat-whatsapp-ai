# UI — Conectar WhatsApp (Embedded Signup)

**Resumen:** Tras el Embedded Signup de Meta, el front envía `code` + IDs al backend. El backend canjea el token (nunca en el browser), persiste el canal del tenant y deja el webhook listo. El callback URL de Meta **no cambia**.

**Backend:** `chat-whatsapp-ai` — migración `20260912220000_whatsapp_embedded_signup`  
**Relacionado:** [02-embedded-signup-whatsapp-business.md](../pending/02-embedded-signup-whatsapp-business.md)

---

## Archivos sugeridos (repo UI)

| Ruta | Qué hacer |
|------|-----------|
| `lib/api/whatsapp-connection.ts` | `completeEmbeddedSignup`, `getWhatsappConnection`, `sendTestMessage` |
| Pantalla settings / onboarding «Conectar WhatsApp» | Botón SDK Meta + estados connected / pending / error |
| Callback del JS SDK | Enviar `code`, `waba_id`, `phone_number_id`, `business_id` al POST complete |

No enviar `code` a logs del browser (salvo debug local). Nunca intercambiar el code en el front.

---

## Autenticación

Igual que el resto del panel (BFF Next → backend):

```
X-API-Key: <BOT_API_SECRET / INTERNAL_API_KEY>
```

Base URL: `BOT_API_BASE_URL` = `https://api-chatbotmanager.easycomp.cl`

El router también responde bajo prefijo `/api` (mismo contrato).

---

## Contrato

### `POST /whatsapp/embedded-signup/complete`

Alias: `POST /api/whatsapp/embedded-signup/complete`  
Alias por negocio: `POST /businesses/:id/whatsapp/embedded-signup/complete`

**Request:**

```json
{
  "code": "<authorization_code>",
  "waba_id": "...",
  "phone_number_id": "...",
  "business_id": "...",
  "tenant_id": "<id del negocio actual>"
}
```

| Campo | Obligatorio |
|-------|-------------|
| `code` | sí |
| `waba_id` | sí |
| `phone_number_id` | sí |
| `business_id` | no (se intenta derivar en Graph) |
| `tenant_id` | sí, salvo que uses la ruta `/businesses/:id/...` |

**Response 200:**

```json
{
  "ok": true,
  "phone_number_id": "...",
  "waba_id": "...",
  "business_id": "...",
  "display_phone_number": "+56...",
  "status": "connected"
}
```

**Errores (4xx/5xx):**

```json
{
  "ok": false,
  "error": "code_expired",
  "message": "El código de autorización expiró. Vuelve a conectar WhatsApp desde el panel."
}
```

| `error` | HTTP | Qué hacer en UI |
|---------|------|-----------------|
| `tenant_required` | 400 | Enviar `tenant_id` |
| `tenant_not_found` | 404 | Recrear / seleccionar negocio |
| `invalid_code` | 400 | Relanzar Embedded Signup |
| `code_expired` | 400 | Relanzar Embedded Signup |
| `code_reused` | 409 | Relanzar Embedded Signup (el code es de un solo uso) |
| `invalid_redirect_uri` | 400 | Avisar a backend (`META_OAUTH_REDIRECT_URI`) |
| `phone_number_conflict` | 409 | Ese número ya está en otro negocio |
| `subscription_failed` | 502 | Reintentar complete con un code nuevo |
| `too_many_requests` | 429 | Esperar ~15 min |
| `Unauthorized` | 401 | BFF / API key |

Rate limit: 8 intentos / 15 min por tenant.

### `GET /whatsapp/connection?tenant_id=`

Alias: `GET /api/whatsapp/connection?tenant_id=`  
Alias: `GET /businesses/:id/whatsapp/connection`

**Response 200:**

```json
{
  "ok": true,
  "connected": true,
  "status": "connected",
  "tenant_id": "...",
  "phone_number_id": "...",
  "waba_id": "...",
  "business_id": "...",
  "display_phone_number": "+56...",
  "token_expires_at": "2026-11-11T12:00:00.000Z",
  "last_error": null,
  "updated_at": "2026-09-12T22:00:00.000Z",
  "meta": {
    "app_id": "1642810900259407",
    "config_id": "1919146745399628"
  }
}
```

`status`: `connected` | `pending` | `error`.  
No incluye tokens. `meta.config_id` sirve para lanzar el SDK.

### `POST /whatsapp/connection/test-message`

Smoke interno: envía un texto al **Tester** usando el **token persistido del Embedded Signup** (no el token global del paso 1).

```json
{
  "tenant_id": "...",
  "to": "+56912345678",
  "text": "Hola, prueba Chat Bot Manager"
}
```

```json
{
  "ok": true,
  "phone_number_id": "...",
  "to": "+56912345678",
  "external_message_id": "wamid...."
}
```

---

## Dependencias de deploy

| Componente | Requisito |
|------------|-----------|
| Backend ECS | Migración `20260912220000_whatsapp_embedded_signup` + `META_APP_ID` |
| Meta | Callback URL **sin cambiar**: `https://api-chatbotmanager.easycomp.cl/webhooks/whatsapp` |
| Front | `config_id` `1919146745399628`, dominio `https://chatbotmanager.easycomp.cl` |
| CORS | Origen `https://chatbotmanager.easycomp.cl` (si el browser llama la API directo; el BFF no lo necesita) |

Fuera de alcance UI: App Review, DNS, display name, OAuth Redirect URIs en dashboard Meta.

---

## Cómo probar (Tester de la app Meta)

1. Completar Embedded Signup en el panel (usuario Tester de la app Agent-Chatbot-AI).
2. El SDK entrega `code`, `waba_id`, `phone_number_id` (y a veces `business_id`).
3. El BFF llama al POST complete (ver curl abajo).
4. `GET .../connection` → `status: connected`.
5. Desde WhatsApp (Tester) enviar «Hola» al número conectado.
6. El mensaje llega a `POST /webhooks/whatsapp` y se asocia al `tenant_id` por `phone_number_id`.

### curl — complete

```bash
curl -sS -X POST "https://api-chatbotmanager.easycomp.cl/api/whatsapp/embedded-signup/complete" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{
    "code": "<CODE_DEL_SDK>",
    "waba_id": "<WABA_ID>",
    "phone_number_id": "<PHONE_NUMBER_ID>",
    "business_id": "<BUSINESS_ID>",
    "tenant_id": "<TENANT_ID>"
  }'
```

Esperado: `200` + `"ok": true` + `"status": "connected"`.

Reusar el mismo `code` → `409` `code_reused`.

### curl — estado

```bash
curl -sS "https://api-chatbotmanager.easycomp.cl/api/whatsapp/connection?tenant_id=<TENANT_ID>" \
  -H "X-API-Key: $INTERNAL_API_KEY"
```

Esperado: `"connected": true`, `phone_number_id` del Signup.

### curl — mensaje de prueba al Tester

```bash
curl -sS -X POST "https://api-chatbotmanager.easycomp.cl/api/whatsapp/connection/test-message" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{
    "tenant_id": "<TENANT_ID>",
    "to": "<NUMERO_TESTER_E164>",
    "text": "Prueba Chat Bot Manager"
  }'
```

Esperado: `200` + `external_message_id`. Si Meta está en modo desarrollo, el destinatario debe estar en la lista de Testers.

### curl — webhook challenge (no debe romperse)

```bash
curl -sS "https://api-chatbotmanager.easycomp.cl/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=ok123"
```

Esperado: `200` body plano `ok123`.

### health

```bash
curl -sS "https://api-chatbotmanager.easycomp.cl/health"
```

Esperado: `200` `{ "ok": true, "db": "up" }`.
