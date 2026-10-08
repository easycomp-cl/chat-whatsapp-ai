# WhatsApp Token Expiration Status

**Actualización:** A partir de octubre 2026, el backend soporta tokens permanentes de Meta (system user de integración) que no vencen, además de los tokens de usuario tradicionales que vencen a los 60 días.

---

## Cambios en `GET /whatsapp/connection`

La respuesta ahora incluye el campo `token_status` que indica el estado de expiración del token de acceso:

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
  "token_status": "ok",
  "last_error": null,
  "updated_at": "2026-09-12T22:00:00.000Z",
  "meta": {
    "app_id": "1642810900259407",
    "config_id": "1046141448397539"
  }
}
```

### Campo `token_status`

| Valor | Significado | Acción recomendada para el UI |
|-------|-------------|-------------------------------|
| `permanent` | Token permanente sin vencimiento (`token_expires_at` es `null`) | No mostrar advertencia de expiración |
| `ok` | Token válido con más de 7 días hasta vencer | Estado normal, sin advertencia |
| `expiring_soon` | Token vencerá en 7 días o menos | **Mostrar banner de advertencia**: "Tu conexión de WhatsApp vencerá pronto. Vuelve a conectar para evitar interrupciones." |
| `expired` | Token ya venció (`token_expires_at` en el pasado) | **Mostrar error prominente**: "Tu conexión de WhatsApp expiró. Reconecta tu número para seguir usando el bot." + deshabilitar funciones que requieren WhatsApp |

### Combinación con `status`

El campo `status` sigue existiendo y tiene prioridad para errores de configuración:

- `status: "error"` → hay un problema en la conexión (ver `last_error`)
- `status: "pending"` → no hay canal configurado aún
- `status: "connected"` → canal activo; verificar `token_status` para saber si el token sigue válido

**Recomendación:** Mostrar advertencias de `token_status` solo cuando `status === "connected"`.

---

## Tokens permanentes

Los tokens emitidos por la configuración de Embedded Signup (`config_id: 1046141448397539`) son **permanentes** y no requieren renovación. Meta los emite como system user de integración con `expires_at = 0`.

**IMPORTANTE:** Este config debe ser Cloud API only (permisos `whatsapp_business_management` + `whatsapp_business_messaging`, sin `business_management`, sin Marketing Messages) con token de system-user que no expira.

Características:
- `token_expires_at` será `null`
- `token_status` será `"permanent"`
- El job diario de monitoreo no genera alertas para estos tokens
- No necesitan reconexión periódica

Los tokens de usuario tradicionales (60 días de vigencia) siguen siendo compatibles y el sistema los maneja correctamente, alertando cuando están por vencer.

---

## Monitoreo interno (backend)

El backend ejecuta un job diario (9:00 AM) que:
1. Busca canales con `tokenExpiresAt` en 7 días o menos
2. Loguea warnings estructurados con `tenantId`, `phoneNumberId`, `daysUntilExpiry`
3. Ignora canales con `tokenExpiresAt = null` (tokens permanentes)

Los logs permiten al equipo de operaciones contactar proactivamente a los clientes antes de que el bot deje de funcionar.

---

## Migración de tokens existentes

Los tokens de 60 días que ya existen en la base de datos seguirán funcionando. Cuando un tenant reconecte su WhatsApp usando la nueva configuración, recibirá un token permanente automáticamente.

**No se requiere acción del frontend** más allá de respetar el nuevo campo `token_status` y mostrar las advertencias correspondientes.
