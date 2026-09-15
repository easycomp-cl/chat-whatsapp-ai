# Backend — Pack de plantillas WhatsApp (WABA)

## Resumen

Pack estándar por negocio: el backend las crea en la WABA del cliente (`PENDING` → Meta aprueba), lista estados para **Mis plantillas** y permite enviar las `APPROVED` fuera de la ventana 24 h.

## Endpoints

| Método | Ruta |
|--------|------|
| GET | `/businesses/:id/whatsapp/templates` |
| POST | `/businesses/:id/whatsapp/templates/provision-defaults` |
| POST | `/conversations/:id/messages/template` |

Tras Embedded Signup se encola `provision-defaults` (no bloquea el HTTP).

## Persistencia

- Enum `ContentType.TEMPLATE`
- Tabla `WhatsappTemplate` (migración `20260915010000_whatsapp_templates`)
- Webhook `message_template_status_update`

## UI

Contrato: [docs/to-front/whatsapp-templates-ui.md](../to-front/whatsapp-templates-ui.md)

## Cómo probar

1. Canal con `wabaId` + token.
2. Provisionar pack → `PENDING` en Graph y BD.
3. Aprobar en WhatsApp Manager o esperar webhook.
4. Enviar `reabrir_conversacion_es` con ventana cerrada.
