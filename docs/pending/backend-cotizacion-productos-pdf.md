# Backend — Cotización de productos en PDF (humano + bot)

**UI:** [cotizacion-productos-ui.md](../to-front/cotizacion-productos-ui.md)  
**Demo / quién hace qué:** [demo-easycomp-repuestos-checklist.md](./demo-easycomp-repuestos-checklist.md)  
**Estado:** implementado en `chat-whatsapp-ai` (preview + PDF + envío). UI modal pendiente.

---

## Resumen

Un solo motor de cotización para:

1. **Asesor (inbox):** preview JSON + PDF que la UI adjunta al composer y el humano envía con caption.
2. **Bot:** si el cliente pide cotización y hay productos identificados (SKU o match de catálogo), generar el **mismo PDF** y mandarlo por WhatsApp como documento, sin usar la plantilla `wood_quote` (tablas/grabado).

No es pasarela de pago ni inventario. Precios salen de `TenantCatalogProduct`. IVA ya viene incluido en el catálogo demo.

---

## Qué ya existe (no rehacer)

| Capacidad | Dónde |
|-----------|--------|
| Listar productos | `GET /businesses/:id/catalog/products` |
| Importar CSV | `POST /businesses/:id/catalog/import/csv` (reindexa documento RAG “Catálogo de productos”) |
| Enviar PDF por WhatsApp | `POST /conversations/:id/messages/media` |
| Precio de despacho por comuna | `TenantDeliveryRegion` / `flow-quote.service` `matchDeliveryCommune` |
| Link de pago | plantilla `link_pago_es` + `PaymentLink` |

No reutilizar `createWoodQuoteFlowGraph`: pide madera, grabado y logo.

---

## Endpoints nuevos

Auth: igual que el resto de la API interna.

### 1. Preview

```
POST /conversations/:conversationId/quotes/preview
```

Body y respuesta: ver spec UI. Resolver `tenantId` desde la conversación. Releer precios **vivos** de BD (ignorar `unit_price` que mande el cliente).

Reglas:

- `quantity` entero 1–99.
- Máximo 30 líneas.
- Producto inactivo o de otro tenant → 400.
- Sin precio → 400 `product_without_price`.
- `delivery_method: pickup` → `delivery.price = 0`.
- `delivery_method: delivery` + comuna conocida → precio de región/comuna; si no hay match → `price: 0` y nota “Flete a confirmar”.
- `quote_number` en preview: `"BORRADOR"` (no gasta correlativo).

### 2. PDF (no envía)

```
POST /conversations/:conversationId/quotes/pdf
```

Mismo body. Asigna `quote_number` correlativo por tenant (`COT-YYYY-0001`). Genera PDF A4. Respuesta binaria `application/pdf`.

Opcional persistir `Quote` (tabla nueva) con líneas, total, `conversationId`, `createdBy: HUMAN | BOT`, `pdfStoragePath`. Si se pospone la tabla, basta correlativo en `Tenant.metadataJson` o secuencia SQL; la tabla es preferible para el demo de “orden”.

### 3. Enviar (bot o atajo interno)

```
POST /conversations/:conversationId/quotes/send
```

Body = preview + `caption?: string`. Genera PDF, lo sube a `chat-media` y lo envía por Graph como documento (`sender_type` según actor; el runtime bot usa `BOT`). Caption default:

`Hola {nombre}, te adjunto la cotización {quote_number}. Total {total} CLP (IVA incluido). ¿Retiro en local o despacho?`

El modal del asesor **no** usa este POST.

---

## PDF — contenido mínimo

Mismo layout que el preview de la UI:

- Logo texto **EasyComp Repuestos** (nombre del tenant, no hardcode si otro negocio usa el mismo endpoint).
- Número, fecha, cliente, teléfono.
- Observación vehículo si viene.
- Tabla SKU / nombre / cant. / P. unit. / total línea.
- Subtotal productos, línea de entrega, **TOTAL**.
- Pie: “Precios de demostración. IVA incluido. Validez 7 días. No confirma stock ni aplicación al vehículo.”

Librería sugerida: `pdfkit` o `@react-pdf/renderer` no aplica en este runtime; preferir `pdfkit` o `pdf-lib` en Node. No parsear el PDF de catálogo comercial; ese archivo es conocimiento, no plantilla.

---

## Runtime del bot (después de los endpoints)

Hoy, si el cliente dice “cotizar”, el orquestador busca intent `request_custom_quote` y puede disparar el flujo de **tablas**. Para EasyComp Repuestos:

1. **No publicar** `wood_quote` en este tenant.
2. Nuevo flujo plantilla `product_quote` **o** acción directa en el pipeline:
   - Extraer SKUs / productos del mensaje + historial contra catálogo (nombre, tags, viscosidad, H4, pulgadas).
   - Si hay ≥1 match con precio y el usuario pidió cotización (“cotiza”, “lo quiero”, “mándame la cotización”, “presupuesto”): llamar `quotes/send`.
   - Si el mensaje trae varias preguntas, el prompt debe responder **todas** y al final ofrecer “¿Armo la cotización en PDF?”.
   - Si no hay match: ofrecer alternativas de la misma categoría; **no** handoff.
3. Tras enviar PDF: preguntar retiro vs envío (nodo `choice` o botones interactivos ya existentes).
4. Si envío: pedir comuna/dirección; recalcular PDF o mandar texto con flete + total.
5. Link de pago: plantilla `link_pago_es` (humano o acción de flujo). **No** está en el MVP del PDF.
6. “Ya pagué” / comprobante / orden de despacho: **fase 2** (ver checklist). No bloquear el PDF por eso.

Handoff (mismo PR o inmediatamente después, si no el demo se cae):

- `cambio de aceite` no debe matchear keyword `cambio` de garantía.
- `rut` para boleta no debe disparar `sensitive_topic` en este tenant (o pedir RUT solo en flujo de facturación).
- Subir `DEFAULT_MAX_SOFT_FALLBACKS` (hoy 1).
- `handoff_on_low_confidence: false` en personalidad del tenant demo.
- Prompt: si faltan datos, preguntar marca/modelo/año/SKU; no anunciar derivación.

---

## Serializer catálogo (opcional, mismo PR)

`GET .../catalog/products` hoy expone camelCase Prisma. Añadir snake_case (`product_id`, `created_at`) **sin romper** camelCase, o versionar. Coordinar con UI.

---

## Cómo probar (backend)

1. Importar `scripts/fixtures/catalogo-easycomp-repuestos.csv` al tenant `easycomp-repuestos`.
2. `POST /quotes/preview` con `ECP-ACE-006` qty 1 + `ECP-AMP-001` qty 2 → products_subtotal `50970`.
3. `POST /quotes/pdf` → PDF abre, totales iguales, filename con `COT-`.
4. Asesor: blob → media send → llega a WhatsApp.
5. Bot (cuando esté): “cotízame el 10W40 de 4 litros y dos H4” → documento saliente `BOT`.

---

## Fuera de alcance de este PR

- Webpay / estado `PAID`.
- PDF de comprobante y orden de despacho.
- Fitment por VIN / tabla de aplicaciones reales.
- Recálculo de IVA 19 %.
