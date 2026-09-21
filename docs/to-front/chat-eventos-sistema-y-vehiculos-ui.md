# UI — Globos de sistema, patente y píldora negra del vehículo

**Repo UI:** `chat-whatsapp-ai-ui` (no editar desde el agente backend)  
**Backend:** [backend-vehiculos-fitment-patente.md](../pending/backend-vehiculos-fitment-patente.md)

## Resumen

En el inbox hay **dos estilos** de globo de sistema (solo panel, nunca WhatsApp):

1. **Píldora azul centrada** — acciones del bot o del asesor (guardó un dato, tomó el chat, cotización, etc.).
2. **Tarjeta oscura centrada** (fondo casi negro, texto blanco, legible) — cuando una **patente nueva** se consultó y **hay datos del auto**. Ahí se muestran marca, modelo, año, patente y extras. El auto queda en el garage del contacto.

## Dependencias de deploy

| Pieza | Notas |
|-------|--------|
| Backend | Migración `20260921180000_vehicle_fitment_system_events` + seed `npm run seed:vehicles`. |
| UI | Render de `SYSTEM` / `SYSTEM_EVENT` con `appearance`. Ninguna variable Vercel nueva. |
| Boostr | Opcional. Sin `VEHICLE_PLATE_API_*` el bot pide marca/modelo/año; la tarjeta oscura solo aparece si hay datos (caché o API). |
| WhatsApp | No enviar estos mensajes. |

## Archivos sugeridos (repo UI)

| Ruta | Qué hacer |
|------|-----------|
| `types/message.ts` | `SYSTEM_EVENT`; `SystemEvent` con `actor` y `appearance` |
| `components/chat/chat-message-bubble.tsx` | Si `senderType === "SYSTEM"` → no izq/der |
| `components/chat/chat-system-event-bubble.tsx` | Azul vs tarjeta oscura según `appearance` |
| `components/chat/chat-vehicle-card.tsx` | Tarjeta negra del auto (opcional, o todo en el bubble) |
| `lib/bot-api/vehicles.ts` | Cliente de patentes / fitment |
| `features/quotes/product-quote-modal.tsx` | Filtro opcional por patente o marca/modelo/año |
| Panel de contacto | `garage.vehicles[]` (varios autos) |

## Contrato del mensaje (`GET /conversations/:id`)

```ts
type SystemEventKind =
  | "profile_saved"
  | "profile_updated"
  | "handoff"
  | "mode_changed"
  | "plate_lookup"
  | "vehicle_identified"
  | "fitment_check"
  | "recommendation"
  | "suggestion"
  | "quote_prepared"
  | "mechanic_note";

type SystemEventActor = "BOT" | "HUMAN";
type SystemEventAppearance = "blue_pill" | "dark_card";

type SystemEvent = {
  kind: SystemEventKind;
  actor: SystemEventActor; // viejos sin actor → "BOT"
  appearance: SystemEventAppearance; // viejos sin appearance → "blue_pill"
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  senderType: "CUSTOMER" | "BOT" | "HUMAN" | "SYSTEM";
  direction: "INBOUND" | "OUTBOUND";
  content_type: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT" | "INTERACTIVE" | "TEMPLATE" | "SYSTEM_EVENT";
  content_text: string; // fallback: "Título: cuerpo"
  created_at: string | Date;
  system_event: SystemEvent | null;
};
```

### Cómo decidir el estilo

| Condición | Estilo |
|-----------|--------|
| `senderType !== "SYSTEM"` y `content_type !== "SYSTEM_EVENT"` | Burbuja normal izq/der |
| `system_event.appearance === "dark_card"` | **Tarjeta oscura** (auto) |
| Resto de SYSTEM | **Píldora azul** |

Atajo equivalente: `kind === "plate_lookup"` **y** `payload.make` o `payload.model` → tarjeta oscura. Preferir `appearance`.

Común a ambos:

1. Centrado, sin cola de burbuja, sin ticks WhatsApp, sin reenviar.
2. No usar como preview del inbox (el backend ya lo excluye).
3. Si `system_event` es `null`, usar `content_text`.
4. No abrir WhatsApp ni marcar no leído del cliente.

### Píldora azul (`appearance: "blue_pill"`)

- Fondo azul suave (`bg-sky-100` / `#E8F4FF`), texto azul oscuro (`#0C4A6E`).
- Radio completo (pill), padding `8px 14px`, max-width ~420px.
- Título semibold; cuerpo regular.

| `kind` | Ícono | Copy de ejemplo |
|--------|-------|-----------------|
| `profile_saved` | lápiz | El bot guardó un dato del contacto · nombre: Camila |
| `profile_updated` | lápiz | El asesor guardó un dato del contacto · RUT |
| `handoff` | persona | El bot derivó… / El asesor tomó la conversación |
| `mode_changed` | flechas | El asesor devolvió la conversación al bot |
| `plate_lookup` (sin datos) | auto | El bot consultó una patente · API no configurada |
| `recommendation` | caja | El bot sugirió repuestos compatibles |
| `quote_prepared` | PDF | El asesor armó y envió una cotización PDF |

### Tarjeta oscura del auto (`appearance: "dark_card"`)

Cuando el sistema **encontró** el auto (API o caché de 30 días).

**Look (obligatorio):**

- Fondo `#141414` (no negro puro `#000`).
- Texto `#F8F8F8`; secundario `#C8C8C8`.
- Radio `16px`, padding `12px 16px`, max-width `340px`, sombra suave `0 8px 24px rgba(0,0,0,.25)`.
- 1px borde `#2A2A2A` para recortar sobre chat oscuro o claro.
- Título `13px` semibold, letter-spacing mínimo: `system_event.title` → **"Vehículo del contacto"**.
- Cuerpo `13px` regular, interlineado 1.35: `system_event.body` (ya viene armado).
- Ícono auto a la izquierda en círculo `#2A2A2A` (opcional).
- Contraste alto: no usar gris medio sobre negro.

**Payload para armar filas si no quieren usar solo `body`:**

```ts
type VehicleCardPayload = {
  appearance: "dark_card";
  actor: "BOT" | "HUMAN";
  plate: string;            // "BBBB12"
  plate_display: string;    // "BB BB 12"
  make: string | null;
  model: string | null;
  year: number | null;
  engine: string | null;
  vehicle_type: string | null;
  color: string | null;
  vin: string | null;
  fuel: string | null;
  version: string | null;
  transmission: string | null;
  status: "found" | "cached";
};
```

Ejemplo de tarjeta:

```
┌─────────────────────────────────┐
│ 🚗  Vehículo del contacto       │
│     Toyota Hilux 2018           │
│     BB BB 12 · CAMIONETA        │
└─────────────────────────────────┘
```

**Nunca mostrar** dueño, RUT ni `owner`. El backend no los manda.

Si `status` es `not_found` / `invalid_plate` / `provider_not_configured` → **no** es `dark_card`; es píldora azul.

## Guardar un dato desde el panel

`PATCH /businesses/:id/customers/:customerId` — enviar `conversation_id` del chat abierto:

```json
{
  "display_alias": "Camila Soto",
  "tax_id": "12345678-5",
  "conversation_id": "<id del chat abierto>",
  "profile_updated_by": "BUSINESS_ADMIN"
}
```

Nombre y apellido van en `profile_metadata` (no sueltos; el schema es `.strict()`):

```json
{
  "profile_metadata": { "first_name": "Camila", "last_name": "Soto" },
  "conversation_id": "<id del chat abierto>",
  "profile_updated_by": "BUSINESS_ADMIN"
}
```

El backend persiste un `Message` `SYSTEM` / `SYSTEM_EVENT` (`appearance: "blue_pill"`). Al recargar el chat la píldora sigue ahí. Si `conversation_id` no es de ese contacto, responde **400**. Si no puede guardar el globo, el `PATCH` **no** responde 200 (rollback del cambio).

`system_event.payload` para armar el globo:

```ts
{
  actor: "HUMAN",
  appearance: "blue_pill",
  actor_name: "EasyComp Repuestos", // nombre del negocio; el bot no lo manda
  added: ["email: nuevo@correo.com"],
  modified: ["nombre visible: Israel -> Isra"]
}
```

- **se añadió:** valor nuevo.
- **se modificó:** `campo: anterior -> nuevo`.
- `content_text` de respaldo: `"El asesor guardó un dato del contacto: se modificó: …"`.
- Sin cambio real de valor → no hay píldora.
- El asesor **puede** pisar un email/nombre ya cargado.
- Nunca va a WhatsApp ni cuenta como no leído.

## Eliminar vehículo o producto del garage

El panel **Vehículos y productos** (basura) debe dejar una píldora azul en el chat abierto. **No va a WhatsApp.**

### Preferido — DELETE dedicado

No pisa el resto del garage (un PATCH con `products_*: []` sí lo vaciaría).

| Método | Ruta | Body |
|--------|------|------|
| `DELETE` | `/businesses/:businessId/customers/:customerId/vehicles/:vehicleKey` | `{ "conversation_id", "actor_name"? }` |
| `DELETE` | `/businesses/:businessId/customers/:customerId/products` | `{ "bucket": "consulted" \| "quoted" \| "purchased", "identity": "sku-or-name", "conversation_id", "actor_name"? }` |

`vehicleKey` es `garage.vehicles[].key` (URL-encode). `identity` matchea `sku`, `product_id` o `name`. Respuesta 200 = el mismo perfil que el GET/PATCH. 404 si no está. 400 si `conversation_id` no es de ese contacto. Si falla el globo → **no** 200 (rollback).

Si se borra el auto activo, el backend deja como activo el primero que quede (o `null`). No hay un segundo globo por el cambio de activo.

### También funciona el PATCH actual

`PATCH /businesses/:id/customers/:customerId` con el garage ya sin el ítem. El backend compara `vehicles` / `products_*` contra el metadata previo y, si salió algo y viene `conversation_id`, inserta la misma píldora.

```json
{
  "profile_metadata": {
    "vehicles": [{ "key": "plate:BBBB12", "plate": "BBBB12", "make": "Toyota", "model": "Hilux", "year": 2018 }],
    "active_vehicle_key": "plate:BBBB12",
    "active_vehicle_plate": "BBBB12",
    "active_vehicle": { "make": "Toyota", "model": "Hilux", "year": 2018, "plate": "BBBB12" }
  },
  "conversation_id": "<chat abierto>",
  "profile_updated_by": "BUSINESS_ADMIN",
  "actor_name": "Israel Gonzalez"
}
```

**No envíen `products_consulted/quoted/purchased: []` al borrar un auto**: el merge pisa el historial. Omito esos keys, o usen el DELETE. `actor_name` es el nombre real del asesor (no “Asesor” ni el tenant). Si no viene, el globo de baja no usa un genérico.

### Píldora (`kind: profile_updated`, `actor: HUMAN`, `appearance: blue_pill`)

```ts
payload: {
  actor_name: "Israel Gonzalez",
  removed: ["vehículo: KK RS 47 · DONGFENG JOYEAR 2018"],
  added: [],
  modified: [],
  source: "inbox_garage_remove"
}
```

`system_event.body` / copy que parsea la UI:

```text
se eliminó: vehículo: KK RS 47 · DONGFENG JOYEAR 2018
```

```text
se eliminó: producto: Filtro de aceite · ECP-FIL-001
```

- Vehículo: `patente · marca modelo año`. Sin patente: `marca modelo año`.
- Producto: `nombre` y, si hay, ` · SKU`.
- Título igual que al guardar datos: “El asesor guardó un dato del contacto”.
- Recargar el chat: el globo sigue. Otro asesor ve el mismo hilo.

## APIs del panel

Auth igual (`x-api-key` vía BFF).

### Consultar patente (asesor)

`POST /conversations/:id/vehicles/lookup` body `{ "plate": "BBBB12" }`

Si hay datos: globo `dark_card` + garage + caché. Respuesta:

```json
{
  "status": "found | cached | invalid_plate | not_found | provider_not_configured",
  "plate": "BBBB12",
  "plate_display": "BB BB 12",
  "make": "Toyota",
  "model": "Hilux",
  "year": 2018,
  "engine": "2.4",
  "color": null,
  "vin": null,
  "fuel": null,
  "version": null,
  "transmission": null,
  "provider_configured": false,
  "vehicle": { "make": "Toyota", "model": "Hilux", "slug": "hilux", "year_from": 2016, "year_to": 2024 },
  "fitment": { "compatible": [], "missing": [] }
}
```

`provider_not_configured` no es error de UI. `400` solo patente inválida.

También: `GET /vehicles/plates/:plate` (no deja globo en el chat).

### Modelos y stock

- `GET /vehicles/models?q=hilux`
- `GET /businesses/:businessId/vehicles/fitment?make=Toyota&model=Hilux&year=2018`
- `GET /businesses/:id/catalog/products?make=Toyota&model=Hilux&year=2018`

## Perfil / garage

`GET /businesses/:id/customers/:customerId` → `garage`:

```ts
type CustomerGarage = {
  first_name: string | null;
  last_name: string | null;
  active_vehicle_key: string | null;
  vehicles: Array<{
    key: string;
    plate?: string;
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
    engine?: string;
    color?: string;
    fuel?: string;
    version?: string;
    source: string;
    last_seen_at: string;
  }>;
  products_consulted: ProductHistoryItem[];
  products_quoted: ProductHistoryItem[];
  products_purchased: ProductHistoryItem[];
};
```

Varios autos; el último mencionado es `active_vehicle_key`. Chips en cabecera del chat.

## UX

1. Globos en orden cronológico.
2. Patente detectada + datos → **tarjeta negra**. Otras acciones → **píldora azul**.
3. Cabecera: chips de todos los vehículos.
4. Menú **+ → Herramientas EasyComp → Consultar patente**.
5. Cotización: filtrar por vehículo del contacto si hay.

## Cómo probar

1. Backend con migración (y seed de vehículos).
2. `Hola me llamo Camila, mi RUT es 12.345.678-5` → píldora azul.
3. Editar email en el panel → píldora azul “El asesor guardó…”.
4. `tengo la patente BB BB 12` → si hay API/caché con datos, **tarjeta negra** “Vehículo del contacto”; si no, azul pidiendo marca/modelo.
5. Misma patente otra vez → no debe gastar API (caché); tarjeta igual.
6. Tomar/devolver el chat → píldoras azules de modo.
7. Preview del inbox no muestra el globo.
8. WhatsApp del cliente no recibe ni azul ni negro.
9. Chat abierto. Eliminar un vehículo del panel → globo azul + nombre del asesor + **se eliminó:** + etiqueta del auto. Recargar: sigue ahí.
10. Eliminar un SKU de “Consultados” → **se eliminó: producto: …**. WhatsApp no recibe nada. Otro asesor ve el mismo globo.
