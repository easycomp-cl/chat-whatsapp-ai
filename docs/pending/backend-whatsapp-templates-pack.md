# Backend — Pack de plantillas WhatsApp (WABA)

## Resumen

Pack estándar por negocio: el backend las crea en la WABA del cliente (`PENDING` → Meta aprueba), lista estados para **Mis plantillas** y permite enviar las `APPROVED` fuera de la ventana 24 h.

## Endpoints

| Método | Ruta |
|--------|------|
| GET | `/businesses/:id/whatsapp/templates` |
| POST | `/businesses/:id/whatsapp/templates/provision-defaults` |
| POST | `/conversations/:id/messages/template` |
| GET | `/pay/:code` (público, sin API key) |
| POST | `/businesses/:id/admin-phone/verification` |
| POST | `/businesses/:id/admin-phone/verification/confirm` |

Tras Embedded Signup se encola `provision-defaults` (no bloquea el HTTP).

## Persistencia

- Enum `ContentType.TEMPLATE`
- Tabla `WhatsappTemplate` (migración `20260915010000_whatsapp_templates`)
- `TenantAdmin.phoneVerifiedAt`, `AdminPhoneVerification`, `PaymentLink` (migración `20260915030000_admin_phone_and_payment_links`)
- Webhook `message_template_status_update`

## Webhook Meta (una vez, app EasyComp)

1. [developers.facebook.com](https://developers.facebook.com) → app **easycomp-chat-bot-manager** (ID `1642810900259407`).
2. WhatsApp → Configuration → Webhook.
3. Callback: `https://api-chatbotmanager.easycomp.cl/webhooks/whatsapp`.
4. Subscribe the field **`message_template_status_update`**.
5. No se hace por cliente: al conectar WhatsApp el backend ya suscribe la WABA.

## UI

Contrato: [docs/to-front/whatsapp-templates-ui.md](../to-front/whatsapp-templates-ui.md)

Pago: `GET /pay/:code` + página `chatbotmanager.easycomp.cl/pay/:code`.
OTP: onboarding ya llama a `admin-phone/verification`. Handoff envía `aviso_handoff_es` solo con `phoneVerifiedAt`.

## Cómo probar

1. Canal con `wabaId` + token.
2. Provisionar pack → `PENDING` en Graph y BD.
3. Aprobar en WhatsApp Manager o esperar webhook.
4. Enviar `reabrir_conversacion_es` con ventana cerrada.
