# Plan de mejora — Perfil de contacto (alias + datos comerciales)

> **Fecha:** 2026-07-28  
> **Repositorio UI:** `chat-whatsapp-ai-ui`  
> **Repositorio backend:** `chat-whatsapp-ai`  
> **Estado:** ✅ **Implementado** (2026-07-28) — migración `20260728220000`, `GET/PATCH /businesses/:id/customers/:customerId`

---

## 1. Problema

Hoy cada contacto (`Customer`) solo guarda lo que viene de WhatsApp:

| Campo actual | Limitación |
|--------------|------------|
| `name` | Nombre de perfil WhatsApp, a menudo poco usable (`Camiliwis 💙✝️👑💍`, emojis, apodos) |
| `phone_number` | Correcto para identificar al cliente |
| `first_seen_at` / `last_seen_at` | Útiles pero no operativos |

El equipo de ventas/atención necesita:

- Un **nombre legible** para inbox, chat y reportes (“Camila”, no el string de WhatsApp).
- **Datos de negocio** visibles al atender: dirección de envío, RUT, tipo de documento (boleta/factura), email de facturación, etc.
- Todo **aislado por empresa** (`business_id` / `tenantId`) — ver [cambios-ui-datos-contacto-cliente.md](../cambios-ui-datos-contacto-cliente.md).

---

## 2. Objetivos

| Objetivo | Métrica de éxito |
|----------|------------------|
| Alias editable por el negocio | Inbox y chat muestran alias cuando existe |
| Datos clave editables sin salir del chat | Panel lateral con guardado en &lt; 2 clics |
| No pisar el nombre WhatsApp | `name` sigue actualizándose desde webhook; alias es capa del negocio |
| Multitenancy intacto | Mismo teléfono en dos empresas = dos perfiles independientes |
| Base para facturación/envíos | Campos estructurados + extensibles por rubro |

## No objetivos (v1)

- CRM completo (pipeline, deals, campañas).
- Sincronizar foto de perfil WhatsApp (API limitada).
- Más de 2 direcciones de despacho + facturación (v1 acotado a 3 bloques; ver §3.6).
- Campos obligatorios en perfil o antes de “cerrar venta” (no hay ventas en plataforma aún).

---

## 3. Propuesta de modelo de datos

### 3.1 Extender tabla `Customer` (recomendado para v1)

Campos nuevos en Prisma / vista `customers`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `displayAlias` | `String?` | Nombre corto elegido por el negocio (“Camila”); usado en UI y en plantillas de saludo del bot |
| `email` | `String?` | Contacto / facturación |
| `taxId` | `String?` | RUT Chile: validación estricta (dígito verificador) + formato visual `12.345.678-9`; editable por admin o bot |
| `invoiceType` | `Enum?` | `RECEIPT` (boleta) \| `INVOICE` (factura) \| `NONE` |
| `companyName` | `String?` | Razón social (relevante si factura) |
| `businessActivity` | `String?` | Giro / actividad económica (relevante si factura; ver §3.7) |
| **Despacho 1** | | Dirección principal de envío |
| `delivery1Line1` … `delivery1Notes` | `String?` | Calle, depto, comuna, región, notas — **comuna/región desde Despachos** (§3.8) |
| **Despacho 2** | | Segunda dirección (opcional) |
| `delivery2Line1` … `delivery2Notes` | `String?` | Idem |
| **Facturación** | | |
| `billingLine1` … `billingNotes` | `String?` | Dirección fiscal / factura |
| `billingSameAsDelivery` | `Enum?` | `NONE` \| `DELIVERY_1` \| `DELIVERY_2` — si no es `NONE`, UI copia/sincroniza bloque elegido |
| `profileMetadata` | `Json?` | Campos extra por rubro |
| `profileUpdatedAt` | `DateTime?` | Última edición del perfil |
| `profileUpdatedBy` | `String?` | `user_id`, `agent_id` o `BOT` |

**Mantener sin tocar:**

- `name` ← solo webhook WhatsApp (solo lectura en UI, con etiqueta “Nombre en WhatsApp”).
- `phoneNumber` ← identificador; no editable.
- `tenantId` / `business_id` ← multitenancy.

### 3.2 Regla de nombre mostrado (UI + API)

Función compartida `resolveCustomerDisplayName(customer)`:

```text
1. displayAlias (trim, no vacío)
2. name de WhatsApp (trim, no vacío)
3. phone_number formateado
4. "Sin nombre"
```

En inbox, burbujas, cabecera de chat y exportes: **siempre** esta regla.

Opcional en UI: subtítulo pequeño con nombre WhatsApp si difiere del alias  
_ej._ título **Camila** · secundario `Camiliwis 💙✝️👑💍`.

### 3.3 Cliente nuevo vs frecuente (bot + UI)

**Hoy (referencia):** `GreetingConfig` distingue `new_customer_warmth` vs `returning_customer_warmth` y `returning_min_messages` (config en Importar chat / tono).

**Cambio acordado:** “Frecuente” se evalúa a nivel **`Customer` + `tenantId`**, no solo mensajes de la conversación abierta:

```text
isReturningCustomer(customer, tenantConfig) :=
  total_messages_inbound(customer) >= returning_min_messages
  OR count_closed_or_prior_conversations(customer) >= 1
  OR customer.profileMetadata.manual_returning === true  // override opcional en panel
```

- Conversación **nueva** o chat **limpiado** no reinicia a “cliente nuevo” si el contacto ya tiene historial en el negocio.
- Plantillas de saludo: placeholder `{nombre}` = `resolveCustomerDisplayName(customer)` (alias primero).
- **UI (panel contacto):** switch opcional “Tratar siempre como cliente frecuente” para casos excepcionales (sin esperar umbral de mensajes).

**Backend:** exponer en `Customer` (o en GET customer) `inbound_message_count` / `is_returning` calculado para que bot y dashboard coincidan.

### 3.4 Bot completando perfil

Cuando el bot extraiga datos en flujo conversacional (RUT, dirección, email):

- Llamar `PATCH .../customers/:id` con `profile_updated_by: "BOT"` (o header interno).
- No sobrescribir campos ya completados por humano **salvo** que el valor nuevo venga confirmado explícitamente (regla backend).
- Registrar en logs/auditoría v2 quién escribió cada campo.

### 3.5 Alternativa descartada para v1

Tabla `CustomerProfile` 1:1 — más normalizada pero más joins; solo vale la pena si varios agentes editan historial de cambios pesado. Para MVP, columnas en `Customer` + `profileMetadata` jsonb alcanza.

### 3.6 Decisiones de producto (cerradas — 2026-07-28)

| Tema | Decisión |
|------|----------|
| **Permisos edición** | **Solo `BUSINESS_ADMIN`** (y `SUPER_ADMIN` en consola). **`COLLABORATOR`:** solo lectura del perfil por ahora. Ver [backend-team-roles-collaborador.md](./backend-team-roles-collaborador.md). |
| **Bot y datos del perfil** | Si el bot obtiene RUT, dirección u otros datos en la conversación, **puede persistirlos** en el mismo `Customer` (vía tool/API interna), con trazabilidad `profileUpdatedBy = BOT`. |
| **Direcciones v1** | **2 direcciones de despacho** + **1 dirección de facturación**. La de facturación puede ser **la misma** que despacho 1 o 2 (checkbox “Usar misma dirección que despacho N”). |
| **Saludo del bot** | Mantener lógica **cliente nuevo vs frecuente** (como en `GreetingConfig` / saludos sugeridos). En saludos de cliente frecuente, usar **`displayAlias` si existe** (ej. “Hola Camila”). |
| **Cliente frecuente** | La condición “frecuente” es por **contacto (`Customer`) en el negocio**, no solo por conversación actual: si ya hubo historial con ese teléfono, aplica saludo de frecuente **aunque el chat/conversación sea nueva**. |
| **RUT** | **Validación estricta** (dígito verificador módulo 11). En UI mostrar formato chileno `12.345.678-9`; en BD normalizar sin puntos (ej. `12345678-9`). Rechazar guardado si RUT inválido cuando el campo no está vacío. |
| **Factura** | Tipo factura implica campos **RUT + razón social + giro** (`businessActivity`), pero **ningún campo del perfil es obligatorio** en v1. |
| **Campos obligatorios** | **Ninguno.** No hay flujo de venta/cierre en la plataforma aún; todo el perfil es informativo y opcional. |
| **Despachos / comunas** | **Sí en v1:** región y comuna en formulario de dirección se eligen desde lo configurado en **Despachos** del tenant (ver §3.8). |

### 3.7 Validación RUT (UI + backend)

- Al escribir: formatear en vivo (`12.345.678-9` o `12.345.678-K`).
- Al guardar: validar dígito verificador; si falla → error y no persistir.
- Campo vacío → permitido (no obligatorio).
- Helper compartido sugerido: `formatRutDisplay()`, `normalizeRutStorage()`, `isValidChileanRut()`.

### 3.8 Región y comuna desde Despachos

**Fuente de datos (ya existe en UI):**

- `GET /businesses/:businessId/delivery/regions` → `DeliveryRegion[]` con `communes[]` (`src/lib/bot-api/client.ts` → `listDeliveryRegions`).
- Filtrar en UI: `region.is_active` y `commune.is_active`.

**UX en panel contacto (cada bloque de dirección):**

1. Select **Región** — solo regiones activas del negocio en Despachos.
2. Select **Comuna** — comunas activas de la región elegida (cascada).
3. Si el negocio no tiene regiones en Despachos: mensaje + enlace a `/app/despachos` (“Configura zonas de despacho primero”).
4. Línea de calle/depto/notas sigue siendo texto libre.

**Persistencia:** guardar `deliveryN_region` y `deliveryN_commune` como **nombre** (string) alineado al catálogo Despachos; opcional v1.1 guardar `commune_id` para precios de envío futuros.

**Bot:** al inferir comuna en chat, validar contra el mismo catálogo Despachos del tenant antes de persistir (o guardar texto y marcar “sin match” en metadata).

---

## 4. Campos sugeridos por contexto (Chile)

### Siempre visibles en panel (v1)

| Campo UI | Campo BD | Notas |
|----------|----------|-------|
| Alias | `displayAlias` | Input texto, max 80 chars |
| RUT | `taxId` | Validación estricta + formato visual CL |
| Boleta / Factura | `invoiceType` | Select; sin campos obligatorios |
| Razón social | `companyName` | Visible si factura; opcional |
| Giro | `businessActivity` | Visible si factura; opcional |
| Email | `email` | |
| Despacho 1 | `delivery1_*` | Región/comuna desde Despachos |
| Despacho 2 | `delivery2_*` | Opcional |
| Facturación | `billing_*` + “Igual que despacho 1/2” | Checkbox en UI |

### En `profileMetadata` (v1.1, por negocio)

Configurables desde settings del tenant (`TenantConfig`):

```json
{
  "customer_profile_fields": [
    { "key": "preferred_payment", "label": "Forma de pago", "type": "select", "options": ["Transferencia", "Efectivo"] },
    { "key": "birthday", "label": "Cumpleaños", "type": "date" }
  ]
}
```

Rubros ejemplo:

- **Pastelería:** fecha retiro, dedicatoria torta, alergias.
- **TWD / muebles:** tipo de madera preferida, medidas espacio.
- **Retail:** talla, SKU favorito.

---

## 5. API propuesta (backend)

Todas las rutas bajo tenant del usuario autenticado.

### GET `/businesses/:businessId/customers/:customerId`

Respuesta incluye campos actuales + perfil extendido.

### PATCH `/businesses/:businessId/customers/:customerId`

Body parcial (solo campos enviados):

```json
{
  "display_alias": "Camila",
  "tax_id": "12.345.678-9",
  "invoice_type": "INVOICE",
  "company_name": "Comercial SpA",
  "business_activity": "Venta al por menor de muebles",
  "email": "camila@email.com",
  "delivery1_line1": "Av. Principal 123",
  "delivery1_commune": "Las Condes",
  "delivery1_region": "Metropolitana",
  "delivery2_line1": "Bodega norte, km 12",
  "billing_same_as_delivery": "DELIVERY_1",
  "profile_metadata": { "preferred_payment": "Transferencia" },
  "profile_updated_by": "BUSINESS_ADMIN"
}
```

**Validaciones backend:**

- `customer.tenantId === businessId` (403 si no).
- Solo `BUSINESS_ADMIN` / `SUPER_ADMIN` pueden PATCH desde dashboard (403 para `COLLABORATOR` / `AGENT` legacy).
- `display_alias`: trim, longitud, sin solo emojis (opcional).
- `tax_id`: si presente → normalizar + **validar dígito verificador**; rechazar 400 si inválido.
- `invoice_type`, `company_name`, `business_activity`: **sin reglas de obligatoriedad** en v1.
- **No** permitir PATCH de `name` ni `phone_number` desde dashboard (solo ingest webhook).

### Server Action UI (fase implementación)

`updateCustomerProfileAction(customerId, patch)` → llama bot API → `revalidatePath` conversaciones.

### Vista Supabase

Actualizar vista `public.customers` con columnas nuevas para lectura directa en inbox (misma estrategia que hoy).

---

## 6. Experiencia de usuario (UI)

### Fase UI-1 — Alias (MVP, mayor impacto)

| Ubicación | Cambio |
|-----------|--------|
| Panel contacto | Input “Alias” + guardar; muestra nombre WhatsApp como solo lectura |
| Lista conversaciones | `resolveCustomerDisplayName` |
| Cabecera chat + burbujas | Idem |
| Búsqueda inbox | Buscar por alias **y** teléfono **y** nombre WhatsApp |

### Fase UI-2 — Datos comerciales

| Ubicación | Cambio |
|-----------|--------|
| Panel contacto | Sección “Datos del cliente” con formulario (solo editable si `canManageCustomerProfile`) |
| Región / comuna | Select en cascada desde `listDeliveryRegions` (módulo Despachos) |
| Chips resumen | En cabecera chat (admin): `📍 Las Condes` · `Factura` si hay datos |

### Fase UI-3 — Rubro y metadata

- Settings → “Campos extra de contacto”.
- Render dinámico en panel según `customer_profile_fields`.

### Permisos (RBAC) — decisión v1

| Rol | Ver perfil | Editar perfil (alias, RUT, direcciones, factura) |
|-----|------------|--------------------------------------------------|
| COLLABORATOR / AGENT (legacy) | Sí | **No** (solo lectura) |
| BUSINESS_ADMIN | Sí | **Sí** |
| SUPER_ADMIN | Sí (admin) | Sí |

Bot (servicio interno): puede PATCH campos de perfil con origen `BOT`, sin rol de usuario.

**UI:** añadir `canManageCustomerProfile(role)` en `src/lib/rbac.ts` (mismo criterio que `canManageSettings`).

---

## 7. Multitenancy y privacidad

- Todos los endpoints filtran por `tenantId`.
- RLS Supabase: `can_access_tenant("tenantId")` en `Customer` (ya existe).
- `profile_metadata` no se comparte entre tenants.
- Auditoría opcional: tabla `CustomerProfileAudit` (v2) con quién cambió qué.

**Mismo teléfono, dos empresas:** cada tenant edita su propio `Customer`; alias “Camila” en TWD no afecta a Don Pepe.

---

## 8. Plan de implementación por fases

### Fase 0 — Alineación

- [x] Solo **admin** edita perfil; **colaborador** lectura.
- [x] Dos direcciones de despacho + facturación (puede coincidir).
- [x] Bot puede persistir datos obtenidos en chat.
- [x] Saludo frecuente por historial de **contacto**; alias en `{nombre}`.
- [x] RUT: validación estricta + formato visual.
- [x] Factura: incluye giro (`businessActivity`); **ningún campo obligatorio**.
- [x] Región/comuna desde catálogo **Despachos** del tenant.

### Fase 1 — Backend MVP (1–2 sprints)

- [ ] Migración Prisma + vista `customers`.
- [ ] `PATCH/GET customer profile` en bot API.
- [ ] Tests: multitenancy, alias no pisa `name`, webhook sigue actualizando `name`.
- [ ] `is_returning` / contador mensajes por customer para saludos.
- [ ] Endpoint/tool para que el **bot** actualice perfil (`profile_updated_by: BOT`).

### Fase 2 — UI MVP (1 sprint, en paralelo tras contrato API)

- [ ] Helper `resolveCustomerDisplayName` centralizado.
- [ ] Panel: alias, RUT, factura (+ giro), despacho 1 y 2, facturación; selects región/comuna desde Despachos.
- [ ] Switch opcional “Tratar como cliente frecuente”.
- [ ] Inbox + chat usan alias.
- [ ] Doc `docs/cambios-ui-perfil-contacto.md`.

### Fase 3 — Mejoras

- [ ] Bot: preguntar dirección/RUT y guardar vía tool (backend conversacional).
- [ ] Búsqueda por alias/RUT.

### Fase 4 — Opcional

- [ ] Historial de cambios de perfil.
- [ ] Import/export CSV de contactos.
- [ ] Duplicados: aviso si mismo RUT en dos `Customer` del mismo tenant.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Webhook sobrescribe “nombre” y confunde al usuario | UI separa etiquetas: “Alias (tu negocio)” vs “Nombre WhatsApp” |
| Datos sensibles (RUT) | RLS + no loguear en plaintext; enmascarar RUT parcial en listados si se pide |
| Campos distintos por rubro | `profile_metadata` + config tenant |
| Scope creep | Fase 1 solo alias + 5 campos fijos |

---

## 10. Preguntas abiertas

Todas las decisiones de producto para v1 están cerradas (§3.6–§3.8). Pendiente solo implementación backend/UI.

### Referencia: integración Despachos

El módulo **Despachos** (`/app/despachos`) ya define por negocio qué **regiones y comunas** atiende. El formulario de dirección del contacto reutiliza ese catálogo vía `listDeliveryRegions(businessId)` — no texto libre en comuna/región.

---

## 11. Resumen ejecutivo (para pasar al equipo backend)

**Pedido:** Extender `Customer` con `displayAlias`, RUT (validado), factura + **giro**, **2 despachos + facturación** (comuna/región desde Despachos), email, metadata; `GET/PATCH` solo admin; bot puede completar perfil; cliente frecuente por historial; saludos con alias.

**UI lista para:** alias en inbox/chat, formulario admin-only, selects Despachos, helpers RUT, override “cliente frecuente”.

**Multitenancy:** Sin cambios; clave `(tenantId, phoneNumber)` sigue vigente.

**Prioridad v1:** alias + RUT validado + tipo documento + giro + 2 despachos (Despachos) + facturación — **todo opcional**.
