# UI — Mensajes interactivos WhatsApp (botones y listas)

**Estado backend:** ✅ Implementado en `chat-whatsapp-ai` (bot/flujos; recepción `button_reply` / `list_reply`).

---

## Resumen

Cuando un **flujo** llega a un nodo `choice` con 1–3 opciones, el bot envía **botones de respuesta** nativos de WhatsApp. Con 4–10 opciones envía una **lista**. El cliente toca una opción; el backend recibe el `id` y avanza el flujo.

**Asesor humano:** por ahora solo texto/media (sin API de interactivos desde dashboard).

---

## Mensaje saliente interactivo

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `content_type` | `"INTERACTIVE"` | Nuevo valor en enum |
| `content_text` | string | Resumen legible (body + opciones) |
| `interactive` | objeto \| null | Payload para render en dashboard |

### Shape `interactive` (API)

```ts
type InteractiveButtons = {
  type: "button";
  body: string;
  buttons: Array<{ id: string; title: string }>;
};

type InteractiveList = {
  type: "list";
  body: string;
  buttonText: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
};

type interactive = InteractiveButtons | InteractiveList;
```

**Nota:** En WhatsApp el cliente ve botones/lista nativos. En el **dashboard** mostrar `content_text` o un bloque tipo “Opciones: Despacho · Retiro” (los botones no son clicables en la UI web).

---

## Mensaje entrante (respuesta del cliente)

El cliente aparece como mensaje `TEXT` normal:

- `content_text` = título elegido (ej. `"Despacho"`)
- El `id` interno se usa solo en backend/flujo (no expuesto en vista hoy)

---

## Tiempo real

Mismo canal que el resto: `INSERT` en `Message` vía Supabase Realtime. Campo nuevo `content_type: INTERACTIVE` en salientes.

Si la vista `messages` filtra por `content_type`, incluir `INTERACTIVE`.

---

## Cómo probar E2E

1. Flujo con nodo `choice` y 2 opciones (`delivery` / `pickup`).
2. Cliente escribe trigger del flujo en WhatsApp.
3. Debe llegar mensaje con botones (no solo texto numerado).
4. Cliente toca botón → flujo avanza.
5. En dashboard, mensaje saliente con `content_type: INTERACTIVE`.

---

## Meta

- Ventana **24 h** desde último mensaje del cliente.
- Sin configuración extra en Meta si Cloud API ya funciona.
- Límites: 3 botones, 10 filas en lista.
