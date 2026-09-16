# UI — Plantillas WhatsApp (Mis plantillas + envío)

**Resumen:** El backend ya puede **crear el pack estándar** en la WABA del negocio, **listar estados** de Meta y **enviar** plantillas `APPROVED` en una conversación. La UI debe mostrar chips en **Mis plantillas** y un selector en el composer cuando la ventana 24 h está cerrada.

**Backend:** `chat-whatsapp-ai` — migración `20260915010000_whatsapp_templates`  
**Specs previas (UI):** `docs/pending/to-backend/backend-whatsapp-standard-template-pack.md`

---

## Dependencias de deploy

| Pieza | Notas |
|-------|--------|
| Backend | Migración Prisma + worker `whatsapp-templates` |
| Meta | Webhook de la app: campo `message_template_status_update` |
| Vercel / UI | Ninguna variable nueva |
| Supabase | No hay migración de UI |

---

## Contrato API

Auth igual que el resto: `X-API-Key`.

### Listar (Mis plantillas)

```
GET /businesses/:id/whatsapp/templates
GET /businesses/:id/whatsapp/templates?status=APPROVED
```

```json
{
  "templates": [
    {
      "name": "seguimiento_asesor_es",
      "language": "es",
      "category": "UTILITY",
      "status": "PENDING",
      "quality": null,
      "rejection_reason": null,
      "body_preview": "Hola {{1}}, recibimos tu consulta en {{2}}...",
      "variable_count": 2,
      "parameter_fields": [
        { "component": "body", "index": 1, "label": "Nombre del cliente", "example": "Camila" },
        { "component": "body", "index": 2, "label": "Nombre del negocio", "example": "Panadería Aurora" }
      ],
      "in_pack": true,
      "product_use": "Recontacto al cliente con ventana 24 h cerrada",
      "meta_template_id": "123",
      "last_error": null,
      "updated_at": "2026-09-15T00:00:00.000Z"
    }
  ],
  "pack": "standard_v1",
  "connected": true
}
```

`status`: `NOT_CREATED` | `PENDING` | `APPROVED` | `REJECTED` | `PAUSED` | `DISABLED`.

Hasta que Meta apruebe, **no se envían**.

### Crear / reintentar pack

```
POST /businesses/:id/whatsapp/templates/provision-defaults
```

Se dispara **solo** al conectar WhatsApp (Embedded Signup). Este POST es el botón **Crear pack en Meta** de Mis plantillas.

```json
{
  "pack": "standard_v1",
  "created": ["seguimiento_asesor_es"],
  "skipped": ["aviso_handoff_es"],
  "pending": ["seguimiento_asesor_es"],
  "failed": []
}
```

### Enviar en conversación

```
POST /conversations/:id/messages/template
```

```json
{
  "template_name": "pedido_actualizacion_es",
  "language_code": "es",
  "body_parameters": ["Juan", "#1042", "En preparación"],
  "agent_phone": "+569..."
}
```

`link_pago_es` también acepta `button_parameters: ["pedido-1042"]` (sufijo de `https://chatbotmanager.easycomp.cl/pay/{{1}}`).

Respuesta `201`: mensaje serializado con `content_type: "TEMPLATE"`, `template_name` y `template`.

Errores útiles:

| HTTP | `error` | Cuándo |
|------|---------|--------|
| 409 | `template_not_approved` | Chip no está Aprobada |
| 409 | `not_connected` | Sin WhatsApp |
| 400 | `parameter_mismatch` | Faltan variables |
| 502/503 | `whatsapp_send_failed` / `token_expired` | Meta rechazó el envío |

---

## Pack `standard_v1`

| name | Uso |
|------|-----|
| `verificar_responsable_es` | Confirmar WhatsApp de admin/asistente (botón link) |
| `aviso_handoff_es` | Cliente pidió humano → WhatsApp del responsable |
| `seguimiento_asesor_es` | Recontacto ventana cerrada |
| `pedido_actualizacion_es` | Estado de pedido |
| `recordatorio_cita_es` | Cita |
| `reabrir_conversacion_es` | “¿sigues necesitando ayuda?” |
| `link_pago_es` | Link de pago (cuerpo + botón URL) |
| `muestra_producto_es` | Detalle del producto consultado |

No son plantillas globales: cada negocio tiene **su copia** en su WABA.

---

## Archivos sugeridos (repo UI)

| Ruta | Qué hacer |
|------|-----------|
| `app/plantillas` o `/app/plantillas` | Lista del pack + chips + botón Crear pack |
| Composer (ventana cerrada) | Menú **+ → Plantilla WA**: solo `APPROVED` |
| Modal variables | Usar `parameter_fields` + preview con `body_preview` |
| Burbuja de mensaje | Si `content_type === "TEMPLATE"`, mostrar `content_text` (ya renderizado) |

---

## Cómo probar

1. Negocio con WhatsApp conectado (Embedded Signup o canal con `waba_id`).
2. `POST .../templates/provision-defaults` → chips **Pendiente**.
3. En WhatsApp Manager aprobar (o esperar webhook).
4. `GET .../templates` → **Aprobada**.
5. Conversación con ventana 24 h cerrada → enviar `reabrir_conversacion_es` → llega al celular.
6. Adjuntar MP3 no aplica; un `REJECTED` debe mostrar `rejection_reason`.

## Fuera de alcance UI

- Crear plantillas custom distintas del pack (más adelante).

OTP admin y aviso de handoff: el pack se crea en Meta; el envío al WhatsApp **personal** del responsable es:

- `POST /businesses/:id/admin-phone/verification` (manda `verificar_responsable_es` UTILITY con botón Confirmar)
- El admin toca el botón → `https://chatbotmanager.easycomp.cl/verify-phone/:token`
- `GET`/`POST /verify-phone/:token` (público) marca `phoneVerifiedAt`
- Worker de handoff usa `aviso_handoff_es` solo si el número está verificado.

Página de pago: `https://chatbotmanager.easycomp.cl/pay/:code` (ruta pública en la UI). El backend guarda el código al enviar `link_pago_es` y expone `GET /pay/:code` sin API key.
