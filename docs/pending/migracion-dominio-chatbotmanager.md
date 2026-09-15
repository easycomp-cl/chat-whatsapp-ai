# Migración dominio — EasyComp Chat Bot Manager

> **Estado:** migración API + Meta + UI completada (2026-09-11). Pendiente opcional: retirar legacy `api.conversai`.  
> **UI:** `https://chatbotmanager.easycomp.cl`  
> **API:** `https://api-chatbotmanager.easycomp.cl`

## Por qué no `api-chatbotmanager.easycomp.cl`

1. **`api-chatbotmanager`** debe ser **CNAME → ALB** (no admite CAA en el mismo host).
2. Al emitir ACM, la CA sube a **`chatbotmanager.easycomp.cl`** (Vercel), cuyo CAA **no** incluye Amazon → `CAA_ERROR`.

**Solución:** hostname **hermano** bajo el apex (hereda CAA de `easycomp.cl` con Amazon):

```text
api-chatbotmanager.easycomp.cl  →  CNAME  →  mismo ALB
```

La UI sigue en `chatbotmanager.easycomp.cl` (Vercel). Solo cambia la URL pública del API.

## Checklist — activar API

### 1. DNS (cPanel `easycomp.cl`)

| Tipo | Host | Destino |
|------|------|---------|
| CNAME | `chatbotmanager` | Vercel (UI) |
| CNAME | `api-chatbotmanager` | `easycomp-api-staging-1992710711.sa-east-1.elb.amazonaws.com` |

Opcional: eliminar CNAME `api-chatbotmanager` si existía (ya no se usa).

### 2. CAA

Solo en **`@`** (`easycomp.cl`): `amazon.com`, `amazontrust.com` (ya configurado).  
**No** hace falta CAA en `api-chatbotmanager` (apex lo cubre; no hay CNAME conflictivo con Vercel en la cadena).

### 3. ACM (sa-east-1)

- [x] Certificado `api-chatbotmanager.easycomp.cl`, validación DNS
- [x] CNAME de validación ACM en cPanel
- [x] Estado **Issued**

### 4. ALB `easycomp-api-staging`

- [x] Listener HTTPS `:443` → **Add certificate** (SNI)
- [x] `curl -fsSI https://api-chatbotmanager.easycomp.cl/health` → **200**

### 5. Vercel (UI)

```env
BOT_API_BASE_URL=https://api-chatbotmanager.easycomp.cl
NEXT_PUBLIC_APP_URL=https://chatbotmanager.easycomp.cl
```

- [x] Actualizar en Vercel Production (+ Preview): `BOT_API_BASE_URL=https://api-chatbotmanager.easycomp.cl`
- [x] **Redeploy Production** (fix TS: `chat-media-preview`, `whatsapp-service-window-indicator`, `app-actions`)

Spec UI: [chatbotmanager-ui-rebrand.md](../to-front/chatbotmanager-ui-rebrand.md)

### 6. Meta WhatsApp

- [x] `https://api-chatbotmanager.easycomp.cl/webhooks/whatsapp` (Graph API 2026-09-11)

## Retirar dominios legacy

Solo cuando el API nuevo responda 200 y Meta/UI estén migrados.

| Dónde | Acción |
|-------|--------|
| **cPanel** | Eliminar `api.conversai`, `conversai`, `api.chatbotmanager` |
| **ACM** | ~~Eliminar cert `api.conversai.easycomp.cl`~~ ✓ 2026-09-11 |
| **ALB** | ~~Quitar cert legacy del listener SNI~~ ✓ 2026-09-11 (solo `api-chatbotmanager`) |
| **Repos** | `rg -i conversai` → 0 |

```bash
aws elbv2 remove-listener-certificates \
  --listener-arn "arn:aws:elasticloadbalancing:sa-east-1:024848463506:listener/app/easycomp-api-staging/058fb28c1a64b977/961d6640d7ae7ed3" \
  --certificates CertificateArn=arn:aws:acm:sa-east-1:024848463506:certificate/dac544da-fd87-4d93-8c80-9fd530ae06a1 \
  --region sa-east-1
```

## Headers webhooks de flujos

`X-ChatBotManager-Event`, `X-ChatBotManager-Delivery-Id`, `X-ChatBotManager-Timestamp`, `X-ChatBotManager-Signature`, `X-ChatBotManager-Idempotency-Key`.

## Verificación

```bash
curl -fsS https://api-chatbotmanager.easycomp.cl/health
```
