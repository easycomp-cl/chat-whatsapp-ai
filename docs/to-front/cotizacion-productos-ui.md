# UI — Cotización de productos (Herramientas EasyComp)

**Repo UI:** `chat-whatsapp-ai-ui` (no editar desde el agente backend)  
**Backend PDF:** [backend-cotizacion-productos-pdf.md](../pending/backend-cotizacion-productos-pdf.md) *(endpoints listos)*  
**Checklist demo / onboarding:** [demo-easycomp-repuestos-checklist.md](../pending/demo-easycomp-repuestos-checklist.md)  
**Media ya listo:** [whatsapp-media-ui.md](./whatsapp-media-ui.md) — `POST /conversations/:id/messages/media`  
**Catálogo ya listo:** `GET /businesses/:businessId/catalog/products`

---

## Resumen

En el botón **+** del composer del chat, agregar la sección **Herramientas EasyComp** con **Crear cotización de productos**. Se abre un modal: el asesor elige productos de la BD, cantidades, ve un preview y pulsa **Adjuntar**. Eso genera un PDF y lo deja en el composer (aún no se envía). El humano escribe el texto y envía el PDF por el flujo de media que ya existe.

El **bot** usará el mismo PDF cuando el cliente pida cotización (eso es backend; la UI solo debe renderizar el documento saliente como cualquier PDF).

---

## Dependencias de deploy

| Pieza | Notas |
|-------|--------|
| Backend | `POST /conversations/:id/quotes/preview`, `.../quotes/pdf` y `.../quotes/send` listos. Listar catálogo y enviar PDF por media: ya existían. |
| UI | Modal + menú + preview. **Adjuntar** llama `POST /conversations/:id/quotes/pdf` y pone el blob en el composer. |
| Supabase | Mismo bucket `chat-media` que el resto de adjuntos. |
| Vercel | Ninguna variable nueva. |
| WhatsApp | Ventana 24 h abierta para enviar documento. Si está cerrada, el envío de media falla igual que hoy; no usar esta herramienta para reabrir (usar plantilla). |

---

## Archivos sugeridos (repo UI)

| Ruta | Qué hacer |
|------|-----------|
| `components/chat/chat-composer.tsx` (o el menú del `+`) | Sección **Herramientas EasyComp** |
| `features/quotes/product-quote-modal.tsx` | Modal: buscar, seleccionar, cantidades, preview, adjuntar |
| `features/quotes/product-quote-preview.tsx` | Layout visual de la cotización (mismo contenido que el PDF) |
| `lib/bot-api/catalog.ts` | `GET /businesses/:id/catalog/products` |
| `lib/bot-api/quotes.ts` | `POST .../quotes/preview` y `POST .../quotes/pdf` (cuando existan) |
| `lib/bot-api/messages.ts` | Reusar `sendMediaMessage` de [whatsapp-media-ui.md](./whatsapp-media-ui.md) |
| `types/catalog.ts` / `types/quote.ts` | Tipos de abajo |

---

## UX del botón +

Orden del menú (inbox, conversación abierta):

1. **Adjuntar archivo** (actual: imagen/PDF).
2. **Plantilla WhatsApp** (si la ventana 24 h está cerrada; spec plantillas).
3. Separador.
4. Encabezado de sección: **Herramientas EasyComp**.
5. Ítem: **Crear cotización de productos**.

No mezclar cotización con “Adjuntar archivo”. Cotización abre modal; no abre el file picker.

Deshabilitar el ítem si:

- no hay `businessId` de la conversación;
- el catálogo aún no cargó y falló (`GET` 404/500) — mostrar toast “No se pudo cargar el catálogo”.

---

## Modal — Crear cotización

### Cabecera

Título: `Cotización de productos`.  
Subtítulo: nombre del contacto + negocio.

Campos opcionales (no bloquean generar):

| Campo | Uso |
|-------|-----|
| Nota del vehículo | Texto libre (ej. `Toyota Hilux 2018`). Va al PDF como observación, no valida fitment. |
| Entrega | `Sin definir` / `Retiro en local` / `Despacho`. |
| Comuna | Solo si entrega = Despacho. Si el backend aún no calcula flete en el preview, mostrar “Flete a confirmar” en el preview. |

### Lista de productos

Fuente: `GET /businesses/:businessId/catalog/products`.

Hoy el backend responde **objetos Prisma en camelCase**. Usar estos campos:

```ts
type CatalogProduct = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number | null;
  currency: string; // "CLP"
  category: string | null;
  tags: string[];
  isActive: boolean;
};
```

Cuando el serializer snake_case esté listo (spec backend), aceptar ambos (`sku` / `id` no cambian).

UI:

- Buscador por nombre, SKU, categoría o tag.
- Agrupar por `category` (Aceites, Filtros, Escobillas, Ampolletas, Frenos, Bujías).
- Checkbox o fila seleccionable.
- Input cantidad entero ≥ 1 (default 1).
- Mostrar precio unitario formateado `es-CL` y subtotal de línea.
- Productos sin `price` no se pueden seleccionar (badge “Sin precio”).

Límites: máximo **30 líneas**. Si intenta más, toast.

### Acciones

| Botón | Comportamiento |
|-------|----------------|
| **Generar preview** | Recalcula líneas y total en cliente **y** llama `POST /quotes/preview` cuando exista. Si el endpoint no está, calcular en cliente con `qty * price` y nota “IVA incluido · despacho no incluido”. |
| **Adjuntar** | Llama `POST /conversations/:id/quotes/pdf` (o `/businesses/:id/quotes/pdf`). Recibe `application/pdf`. Cierra el modal y deja el archivo en el composer como adjunto **sin enviar**. |
| **Cancelar** | Cierra sin tocar el composer. |

**Adjuntar no envía a WhatsApp.** El asesor escribe el caption en el composer (ej. “Te dejo la cotización de aceite y luces”) y pulsa enviar. El envío es el `POST .../messages/media` ya documentado, con:

- `file` = PDF generado (`filename`: `cotizacion-{quote_number}.pdf`)
- `caption` = texto del humano

Si el composer ya tenía otro archivo, preguntar si se reemplaza.

---

## Preview (modal)

Debe verse como una hoja A4 compacta (no un dump JSON):

```
EasyComp Repuestos
Cotización COT-2026-0042          16/09/2026
Cliente: Camila R.                WhatsApp: +569...
Obs. vehículo: Hilux 2018 (a confirmar aplicación)

SKU          Producto                         Cant.  P. unit.    Total
ECP-ACE-006  Molygen 10W-40 4 L                  1    $41.990   $41.990
ECP-AMP-001  Ampolleta H4 12 V                   2     $4.490    $8.980
ECP-ESC-006  Escobilla Aerotwin 22"              2    $18.990   $37.980

Subtotal productos (IVA incluido)                         $88.950
Entrega: retiro en local / despacho a Maipú               $5.500 o $0
TOTAL                                                     $94.450

Precios de demostración. IVA incluido. Validez 7 días.
No confirma stock ni que la pieza calce en el vehículo.
```

Números siempre en CLP con `es-CL`. El `quote_number` lo asigna el backend; en preview local usar `BORRADOR`.

---

## Contrato API (cuando el backend publique)

Auth igual que el resto (`X-API-Key` vía BFF).

### Preview

```
POST /conversations/:conversationId/quotes/preview
```

```json
{
  "lines": [
    { "product_id": "clxyz...", "quantity": 2 }
  ],
  "customer_note": "Toyota Hilux 2018",
  "delivery_method": "delivery",
  "commune": "Maipú"
}
```

`delivery_method`: `none` | `pickup` | `delivery`.

**200:**

```json
{
  "quote_number": "BORRADOR",
  "business_name": "EasyComp Repuestos",
  "customer_name": "Camila R.",
  "currency": "CLP",
  "customer_note": "Toyota Hilux 2018",
  "delivery": {
    "method": "delivery",
    "label": "Despacho a Maipú",
    "price": 5500
  },
  "lines": [
    {
      "product_id": "clxyz",
      "sku": "ECP-ACE-006",
      "name": "LIQUI MOLY Molygen New Generation 10W-40 4 L",
      "quantity": 1,
      "unit_price": 41990,
      "line_total": 41990
    }
  ],
  "products_subtotal": 41990,
  "delivery_price": 5500,
  "total": 47490,
  "notes": [
    "Precios de demostración, IVA incluido.",
    "El despacho no está incluido en el precio de catálogo salvo la línea de entrega.",
    "No confirma stock ni aplicación al vehículo."
  ]
}
```

Errores: `400` línea con producto inactivo o sin precio; `404` conversación.

### PDF (blob, no envía)

```
POST /conversations/:conversationId/quotes/pdf
Content-Type: application/json
```

Mismo body que preview. Respuesta:

- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="cotizacion-COT-2026-0042.pdf"`
- Header opcional `X-Quote-Number: COT-2026-0042`

La UI crea un `File` desde el blob y lo pone en el composer.

### Envío automático (solo bot / no usar desde este modal)

```
POST /conversations/:conversationId/quotes/send
```

El humano **no** llama este endpoint desde el modal. Lo usará el runtime del bot. Si un asesor quiere mandar al toque, el camino es Adjuntar → caption → enviar media.

---

## Cómo se ve en el chat

Después de enviar, el globo es `content_type: "DOCUMENT"` con `media.filename` tipo `cotizacion-COT-2026-0042.pdf` y caption debajo. Render igual que [whatsapp-media-ui.md](./whatsapp-media-ui.md).

Si el **bot** envía la misma cotización, `sender_type: "BOT"`; no hay UI extra.

---

## Cómo probar

1. Negocio con catálogo cargado (EasyComp Repuestos, 40 SKUs del CSV demo).
2. Conversación con ventana 24 h abierta.
3. `+` → Herramientas EasyComp → Crear cotización de productos.
4. Buscar `10W-40`, marcar 4 L cantidad 1; buscar `H4` cantidad 2; `Generar preview`.
5. Verificar totales (1×41990 + 2×4490 = 50970) y nota IVA.
6. **Adjuntar** → el composer muestra el PDF; escribir “Te dejo la cotización” → enviar.
7. En WhatsApp del cliente llega el PDF + caption.
8. En el dashboard el globo es documento, no texto plano.

---

## Fuera de alcance UI

- Editor de plantilla visual del PDF (el backend define el layout).
- Stock / inventario.
- Fitment por VIN.
- Cobro real (Webpay). El link de pago sigue siendo la plantilla `link_pago_es`.
- Recalcular IVA (los precios del catálogo demo **ya incluyen IVA**).
- Crear productos desde el modal (solo seleccionar los de la BD).
