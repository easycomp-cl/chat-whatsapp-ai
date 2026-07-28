# Paso 1 — Token permanente de Meta (System User)

**Objetivo:** dejar de renovar el token temporal de «API Setup» (~24 h) y tener un token estable para piloto, scripts y fallback global mientras no exista Embedded Signup.

**Cuándo usar este token:**

| Uso | Variable / destino |
|-----|-------------------|
| Fallback global en backend | `META_SYSTEM_USER_ACCESS_TOKEN` en `.env` / AWS Secrets Manager |
| Vincular canal manual (piloto) | `access_token` en `POST /businesses/:id/whatsapp-accounts` o `link-whatsapp-staging.ps1` |
| Pruebas locales | `USE_ENV_WHATSAPP_TOKEN=true` + `META_SYSTEM_USER_ACCESS_TOKEN` (solo `NODE_ENV=development`) |

**No confundir con:**

| Concepto | Caduca | Para qué |
|----------|--------|----------|
| `WHATSAPP_VERIFY_TOKEN` | No (lo inventas tú) | Verificar webhook `GET /webhooks/whatsapp` |
| `META_APP_SECRET` | No | Validar firma de webhooks |
| Token temporal API Setup | Sí (~24 h) | Solo pruebas rápidas en Developers |
| **System User Access Token** | Puede ser permanente | Producción / piloto |

---

## Requisitos previos en Meta

- [ ] Cuenta en [Meta for Developers](https://developers.facebook.com/)
- [ ] [Meta Business Portfolio](https://business.facebook.com/) (negocio verificado recomendado para producción)
- [ ] App de tipo **Business** con producto **WhatsApp** agregado
- [ ] Un **WABA** (WhatsApp Business Account) con al menos un número conectado
- [ ] Webhook configurado en la app apuntando a `https://api.conversai.easycomp.cl/webhooks/whatsapp`
- [ ] Campo `messages` suscrito en el webhook

---

## Crear System User y token que no expire

### 1. Abrir Business Settings

1. Entra a [business.facebook.com](https://business.facebook.com/) → **Configuración del negocio**.
2. Menú **Usuarios** → **Usuarios del sistema** (System Users).

### 2. Crear usuario del sistema

1. **Agregar** → nombre sugerido: `conversai-api` o `easycomp-bot`.
2. Rol: **Administrador** del portfolio (o el mínimo que permita gestionar la app y el WABA).

### 3. Asignar activos al System User

En el System User → **Asignar activos**:

| Activo | Permiso |
|--------|---------|
| Tu **app de Meta** (ConversAI) | Control total o al menos desarrollo |
| Tu **WABA** | Control total |
| **Número(s)** del WABA | Control total |

Sin estos activos el token no podrá enviar mensajes ni gestionar el número.

### 4. Generar el token

1. En el System User → **Generar token**.
2. Selecciona **tu app de Meta**.
3. Marca permisos (mínimos para este proyecto):

   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`

4. **Importante:** si Meta ofrece duración, elige **Never expire** / **Nunca expira**.
5. Copia el token **una sola vez** (no se vuelve a mostrar).

Documentación oficial:

- [System User access tokens](https://developers.facebook.com/docs/marketing-api/system-users/overview/)
- [Permissions — WhatsApp Business Management](https://developers.facebook.com/docs/permissions/reference#w)

---

## Configurar en EasyComp

### Local (`.env`)

```env
META_SYSTEM_USER_ACCESS_TOKEN=EAAxxxxxxxx...
WHATSAPP_VERIFY_TOKEN=<mismo valor que en Meta webhook>
META_APP_SECRET=<app secret de la app>
WHATSAPP_GRAPH_VERSION=v20.0
```

### Staging / producción (AWS Secrets Manager)

Misma clave `META_SYSTEM_USER_ACCESS_TOKEN` en el secret `chat-whatsapp-ai/staging` (ver [aws-migracion-paso-a-paso.md](../aws-migracion-paso-a-paso.md)).

**Regla:** no commitear el token en Git. Usar `.env.production` solo local y Secrets Manager en cloud.

---

## Validar el token antes de vincular

Desde la raíz del repo:

```powershell
.\scripts\test-whatsapp-token.ps1 `
  -PhoneNumberId "<PHONE_NUMBER_ID_DE_META>" `
  -AccessToken "<SYSTEM_USER_TOKEN>"
```

Salida esperada: `display_phone_number` y `verified_name` del número.

Si falla con `401` / código `190`: token inválido, expirado o sin permisos sobre ese `phone_number_id`.

---

## Vincular el número al tenant (piloto manual)

Cuando el token es válido:

```powershell
.\scripts\link-whatsapp-staging.ps1 `
  -PhoneNumberId "<PHONE_NUMBER_ID>" `
  -PhoneNumber "+56912345678" `
  -AccessToken "<SYSTEM_USER_TOKEN>" `
  -BusinessId "<opcional-si-ya-existe>"
```

Equivalente API:

```http
POST https://api.conversai.easycomp.cl/businesses/{tenantId}/whatsapp-accounts
X-API-Key: <INTERNAL_API_KEY>
Content-Type: application/json

{
  "phone_number_id": "<PHONE_NUMBER_ID>",
  "phone_number": "+56912345678",
  "waba_id": "<WABA_ID_OPCIONAL>",
  "access_token": "<SYSTEM_USER_TOKEN>"
}
```

El backend cifra el token con `ENCRYPTION_SECRET` y guarda en `TenantChannel`. **No requiere redeploy ECS.**

---

## Token global vs token por tenant

| Estrategia | Cuándo |
|------------|--------|
| Solo `META_SYSTEM_USER_ACCESS_TOKEN` en env | Piloto con un número; fallback si falla descifrado del tenant |
| Token en `TenantChannel` por empresa | Producción multi-tenant (cada WABA con su token tras Embedded Signup) |
| Ambos | Recomendado en transición: tenant en BD + fallback en env |

Código relevante: `src/modules/tenants/tenant-resolver.service.ts` → `resolveAccessToken()`.

---

## Checklist de verificación E2E

- [ ] `test-whatsapp-token.ps1` responde OK
- [ ] Canal vinculado (`GET /businesses/{id}` muestra `whatsapp_accounts`)
- [ ] Webhook verificado en Meta (check verde)
- [ ] Enviar «Hola» al número → `POST /webhooks/whatsapp` en logs
- [ ] Bot responde o handoff según config
- [ ] Tras 48 h el token sigue funcionando (confirma que no es temporal)

---

## Errores frecuentes

| Síntoma | Causa | Acción |
|---------|-------|--------|
| Token expira en ~24 h | Es el temporal de API Setup, no System User | Repetir pasos de System User |
| `401` / `190` / subcode `463` | Token expirado o revocado | Generar nuevo token permanente |
| Token OK pero no envía | `phone_number_id` no pertenece al WABA del token | Reasignar activos al System User |
| Webhook no llega | URL, verify token o app en modo incorrecto | Revisar Meta → WhatsApp → Configuration |
| Mensaje no a destinatario en dev | Número no en lista de prueba | Meta Developers → API Setup → test numbers |

---

## Siguiente paso

Cuando este token esté estable y al menos un tenant vinculado en staging:

→ [02-embedded-signup-whatsapp-business.md](./02-embedded-signup-whatsapp-business.md)

Ahí se documenta cómo cada empresa conectará **su propio** WhatsApp Business desde la UI, sin copiar tokens a mano.
