# Demo EasyComp Repuestos — quién hace qué

Guía para el piloto de ventas: el bot asesora con catálogo realista, el humano cierra cotización PDF desde el inbox, y más adelante el bot manda el mismo PDF solo.

**Contrato UI:** [cotizacion-productos-ui.md](../to-front/cotizacion-productos-ui.md)  
**Contrato backend PDF:** [backend-cotizacion-productos-pdf.md](./backend-cotizacion-productos-pdf.md)

Tenant ya creado: slug `easycomp-repuestos`, login panel `easycomp@carparts.cl`.  
Onboarding **no** está hecho (`onboarding_seeded: false` en el script de alta).

---

## Resumen de roles

| Quién | Qué |
|-------|-----|
| **Agente (backend, esta sesión y las siguientes)** | Fixtures del catálogo, specs, luego endpoints PDF + ajuste de handoff + flujo `product_quote`. **No** edita el front. |
| **Tú (humano dueño del demo)** | Completar onboarding, conectar WhatsApp, importar catálogo, subir documentos, personalidad, despacho, plantillas Meta, ensayar el guion. |
| **Equipo UI** | Menú **+ → Herramientas EasyComp → Crear cotización de productos** según el contrato. |

Hasta que el PDF backend y el menú UI existan, **tú** puedes cotizar a mano: eliges productos, armas un PDF (o el del catálogo no sirve como cotización) y lo adjuntas con el clip. El valor del demo esta semana es **conocimiento + inbox**, no el cierre automático.

---

## Lo que ya dejó el agente (esta sesión)

En el repo `chat-whatsapp-ai`:

| Archivo | Para qué |

| Archivo | Para qué |
|---------|----------|
| `scripts/fixtures/catalogo-easycomp-repuestos.csv` | 40 SKUs del PDF (aceites, filtros, escobillas, ampolletas, frenos, bujías) |
| `scripts/fixtures/knowledge/easycomp-repuestos/*.txt` | Perfil, despacho, guía de consulta, FAQs |
| `scripts/fixtures/knowledge/easycomp-repuestos/Catalogo_EasyComp_CarParts_40_SKUs.pdf` | Copia del catálogo visual para subir a Conocimiento |
| `docs/to-front/cotizacion-productos-ui.md` | Contrato del modal y el botón + |
| `docs/pending/backend-cotizacion-productos-pdf.md` | Contrato backend de cotización PDF (ya implementado) |

Importar catálogo (cuando tengas `TENANT_ID` del negocio y la API arriba):

```bash
npx tsx scripts/import-catalog-fixture.ts
```

Con:

- `TENANT_ID` = id de EasyComp Repuestos
- `CATALOG_FIXTURE=catalogo-easycomp-repuestos.csv`
- `BOT_API_BASE_URL` y `INTERNAL_API_KEY` del entorno (staging/prod)

Eso también regenera el documento RAG **Catálogo de productos**.

---

## Lo que ya hizo el agente (backend)

En el repo `chat-whatsapp-ai`, listo para que el front se conecte:

| Pieza | Estado |
|-------|--------|
| `POST /conversations/:id/quotes/preview` | Listo |
| `POST /conversations/:id/quotes/pdf` | Listo (blob PDF, no envía) |
| `POST /conversations/:id/quotes/send` | Listo (bot / atajo interno) |
| Catálogo snake_case + camelCase | Listo |
| Handoff: `cambio de aceite`, `ruta` vs `rut`, 3 fallbacks | Listo |
| Bot manda PDF si pide cotización y hay match de catálogo | Listo |
| Plantilla de flujo `product_quote` | Listo (crear desde UI de flujos; **no** uses `wood_quote`) |

Fixtures de catálogo/conocimiento: ver tabla de archivos arriba.

## Lo que sigue (no bloquea el modal del front)

“Ya pagué”, comprobante y orden de despacho / horario de retiro.

---

## Lo que debes hacer tú, en orden

### 1. Entrar al negocio

1. [https://chatbotmanager.easycomp.cl/login](https://chatbotmanager.easycomp.cl/login)
2. Usuario `easycomp@carparts.cl` (password el del script de alta; cámbialo si este entorno es compartido).
3. Confirma que el negocio se llama **EasyComp Repuestos**.

### 2. Completar el onboarding / perfil

Pega esto (ajusta dirección/teléfono si quieres).

**Tipo:** Productos.

**Descripción:**

> EasyComp Repuestos es un local de mantención automotriz en Santiago. Vendemos aceites, filtros, escobillas, ampolletas, pastillas de freno y bujías. Precios en CLP con IVA incluido. No confirmamos que una pieza calce en un auto sin marca, modelo, año y código OEM. Esta tienda es de demostración.

**Ítems (categorías, no los 40 SKUs):**

| Nombre | Descripción | Precio (opcional) |
|--------|-------------|-------------------|
| Aceites de motor | Liqui Moly Molygen 5W-30, 5W-40 y 10W-40 en 1 L y 4 L | — |
| Filtros | Mann: aceite, aire de motor y cabina | — |
| Escobillas | Bosch Aerotwin 16" a 26" | — |
| Ampolletas | Osram H4, H7, H1, H3, HB3, HB4, W5W, P21W | — |
| Pastillas de freno | Brembo Prime, juego de un eje | — |
| Bujías | NGK estándar e Iridium IX | — |

**Operación:**

- Horario: `Lunes a viernes 9:00 a 18:30. Sábados 9:00 a 14:00. Domingos cerrado.`
- Ciudad: `Santiago` · Comuna: `Providencia`
- Dirección: `Av. Providencia 1240, local 3`
- Pagos: transferencia, efectivo, tarjeta, link de pago
- Despacho: `Retiro sin costo. Despacho RM según comuna (Maipú $5.500 demo).`

**Bot:**

- Nombre: `Sofía`
- Tono: `profesional y cercano`
- Saludo: `Hola, soy Sofía de EasyComp Repuestos. ¿Me dices el SKU, o marca, modelo y año de tu auto?`
- **Derivación con baja confianza: desactivada** (`handoff_on_low_confidence: false`).
- Fallback: `No tengo esa referencia confirmada. ¿Me das SKU, viscosidad, tipo de ampolleta o una foto de la pieza?`

**Contacto humano:** tu WhatsApp de responsable, verificada, con aviso de handoff si quieres ver el escalamiento en el demo (mejor tenerlo, aunque el guion evite dispararlo).

Completar / publicar para que se indexen FAQs semilla + perfil.

### 3. Conectar WhatsApp

Número del piloto (el que uses en la demo). Embedded Signup o el flujo que ya tengan. Sin canal no hay demo en el celular.

Luego **Mis plantillas → Crear pack** y esperar **APPROVED** en:

- `link_pago_es`
- `muestra_producto_es`
- `pedido_actualizacion_es`
- `aviso_handoff_es`

### 4. Catálogo

Importa `scripts/fixtures/catalogo-easycomp-repuestos.csv` (script de arriba o pantalla de catálogo si la UI ya importa CSV).

Deben verse 40 productos activos, SKUs `ECP-ACE-001` … `ECP-BUJ-004`.

### 5. Conocimiento (subir archivos)

En la base de conocimiento del negocio, sube:

1. El PDF `Catalogo_EasyComp_CarParts_40_SKUs.pdf`
2. `sobre-easycomp-repuestos.txt`
3. `despacho-y-retiro.txt`
4. `guia-consulta-catalogo.txt`
5. `faqs-demo.txt`

Espera a que el estado pase a indexado. Prueba en el panel “¿qué venden?” antes de llamar a un cliente.

### 6. Zonas de despacho

Crea región RM y comunas demo:

| Comuna | Precio |
|--------|--------|
| Providencia, Ñuñoa, Santiago | 3500 |
| Las Condes, Vitacura, La Reina | 4500 |
| Maipú, Puente Alto, San Bernardo, La Florida, Peñalolén, Macul, Recoleta, Independencia | 5500 |

Retiro = $0 (el motor ya lo trata así si el método es pickup).

### 7. No actives el flujo de tablas

Si al crear un flujo la UI ofrece plantilla **cotización de tablas / wood_quote**, **no la publiques** en este tenant. Rompe el demo (pide madera y grabado).

### 8. Ensayo del guion (esta semana)

Cliente de prueba (tu celular):

1. `Hola`
2. `Tienen aceite 10W40 de 4 litros? Y luces H4? También gomas de 22 pulgadas. Hacen envío a Maipú?`
3. Si el bot responde las tres familias con SKU y precio + flete Maipú, el conocimiento está bien.
4. `Pásame cotización de 1 aceite 4L, 2 H4 y 2 escobillas 22"`
5. **Tú en el inbox:** `+` → cotización (cuando exista) **o** adjuntar un PDF hecho a mano + texto “Te dejo la cotización”.
6. Cliente: `retiro mañana`
7. Tú: horario `lun–sáb, Providencia 1240 local 3` y, si aplica, plantilla `link_pago_es`.
8. Cliente: `ya pagué`
9. Tú: plantilla `pedido_actualizacion_es` con estado `Pagado. Listo para retiro en local.`

**Evita en el guion** hasta que el agente ajuste handoff:

- la palabra suelta `cambio` (`cambio de aceite` hoy puede ir a garantía);
- pedir `RUT` (hoy es tema sensible);
- “quiero un vendedor”;
- “cotización especial / mayorista”.

Usa `aceite 10W-40`, `filtro de aceite`, `luces H4`, no “cambio de aceite”.

---

## Guion corto para mostrar a un prospecto

> Cliente pregunta tres cosas en un WhatsApp. El bot saluda, lista SKU y precio de aceite, ampolleta y escobilla, y explica el envío a Maipú sin inventar que “esa pieza es de la Hilux”. El asesor (tú) manda la cotización PDF en 20 segundos desde el mismo chat. Si el cliente acepta, eliges retiro o despacho y le mandas el link de pago de la app.

Eso es vendible **ahora** con los pasos 1–8. El “el bot arma el PDF solo” se suma cuando esté el backend de cotización; el “ya pagué → comprobante + orden” es fase 2.

---

## Qué no prometas en la reunión

- Que el bot sabe qué filtro lleva una Hilux 2018 (el catálogo demo **no tiene ficha de aplicación**).
- Cobro real con Webpay.
- Stock en vivo.
- PDF de cotización automático **hasta** que exista `POST /quotes/pdf` y el menú del front.

Sí puedes decir: catálogo en el bot, WhatsApp, inbox con humano, plantillas, y (en roadmap) cotización PDF igual para bot y asesor.
