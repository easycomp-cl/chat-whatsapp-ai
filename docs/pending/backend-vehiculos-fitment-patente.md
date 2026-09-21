# Backend — Patentes, fitment de repuestos, globos de sistema y agente mecánica (beta)

**Estado:** implementado en backend (migración `20260921180000_vehicle_fitment_system_events`).  
**Contrato UI:** [../to-front/chat-eventos-sistema-y-vehiculos-ui.md](../to-front/chat-eventos-sistema-y-vehiculos-ui.md)

## Resumen

El runtime ahora:

1. Consulta patentes chilenas (caché 30 días + proveedor HTTP opcional).
2. Mantiene una **base global** año/marca/modelo → tipo de repuesto, contrastada con el catálogo activo del tenant (`isActive` = “en stock”).
3. Escribe **eventos de sistema** en el hilo (`senderType: SYSTEM`) para el inbox: no salen por WhatsApp.
4. Extrae de **cada mensaje inbound** nombre, apellido, RUT, email, dirección, **todas las patentes** y VIN, y arma un **garage** (varios autos) más historial de productos consultados / cotizados / comprados.
5. Activa un **agente mecánica beta** cuando el cliente habla de auto/repuesto/patente.

## Varios autos en el mismo chat

Es un escenario real (familia, flota, “el de mi señora”). El backend **no pisa** el auto anterior:

- Cada patente/VIN/modelo se agrega a `garage.vehicles[]`.
- El último mencionado queda como `active_vehicle_key`.
- El bot recibe la lista completa y la instrucción de no mezclar repuestos entre autos.

## Historial de productos

| Evento | Cuándo se guarda |
|--------|------------------|
| `products_consulted` | Match de catálogo en el chat o recomendación de fitment |
| `products_quoted` | Cotización PDF enviada (`ProductQuote` SENT) |
| `products_purchased` | El cliente dice que pagó / compró / mandó comprobante (heurística). No hay ERP de ventas aún. |

Todo sale en `GET /businesses/:id/customers/:customerId` → `garage`.

## Fuentes públicas Chile / APIs (investigación)

**No existe una API pública oficial chilena de patentes ni un catálogo estatal de “qué repuesto calza en qué auto”.** Lo que hay:

| Fuente | Tipo | Sirve para |
|--------|------|------------|
| Registro Civil (consulta de patente) | Formulario web, sin API | No integrar (ToS / scraping) |
| [datos.gob.cl](https://datos.gob.cl) / INE / ANAC / MTT | Datos abiertos agregados (parque, ventas) | Estadísticas, no fitment ni patente individual |
| 3CV (homologación) | Certificación de modelos | No es catálogo de SKUs |
| **Autofact / Autofact Pro** | Informes retail + B2B sin lista pública de API | Patente → historial / marca-modelo-año |
| **TecDoc / TecAlliance** | Catálogo aftermarket de pago (API cotizada) | Fitment serio (el estándar LatAm) |
| **NHTSA vPIC** (EE.UU., pública) | `DecodeVinValues/{VIN}` | Ya integrada si el cliente entrega **VIN**. Homologación Chile/US puede diferir. |
| Boostr | API REST comercial Chile | Patente → datos vehiculares (alternativa publicada) |

Integración actual: `VEHICLE_PLATE_API_URL` (cualquier HTTP que devuelva make/model/year) + NHTSA para VIN. El fitment propio (seed EasyComp) cubre el demo hasta tener TecDoc.

### Precios Autofact (Chile)

Autofact **no publica** un precio por consulta de API para developers. Lo que está en su web (abril 2026):

| Producto | Precio público | Qué es |
|----------|----------------|--------|
| Patente Express / informe gratis | $0 | Datos limitados en la web, no es API |
| Informe de precio | **$5.990** | Tasación; no es fitment de repuestos |
| Informe Full | **$8.990** | Historial legal + inscripción (marca, modelo, año, VIN, motor, etc.) |

Para integrar consultas en un bot hay que cotizar **Autofact Pro / alianzas comerciales** (sin tarifa pública). El Informe Full de $8.990 es el techo retail por patente; un contrato B2B suele ser menor por volumen, pero no hay cifra oficial.

Referencia de mercado para una **API chilena de patente** (no es Autofact): [Boostr](https://docs.boostr.cl/reference/pricing-patentes-chile) al 7 jul 2026, **sin IVA**:

| Plan | Precio | Consultas |
|------|--------|-----------|
| Free | $0 | 5/día (básico) |
| Starter | $5.000 / mes | 50/día |
| Pro | $20.000 / mes | 100/día |
| Full | $90.000 / mes | 300/día |
| Créditos | **$50 CLP / consulta** | Mínimo 200 ($10.000) |

Para el bot alcanza el plan básico (marca, modelo, año, dueño). El extendido (VIN, versión, motor) empieza en Pro.

### Precios TecDoc / TecAlliance

TecAlliance **no publica** un precio por llamada de API. La licencia se cotiza (tamaño, B2B/B2C, país, volumen, si incluye VIN).

| Producto | Precio de referencia | Nota |
|----------|----------------------|------|
| TecDoc Catalogue (escritorio, Brasil) | **R$ 1.145–1.220 / año** por licencia (~USD 200–250) | Catálogo humano, **no** es el Web Service |
| TecDoc Web Service (API) | Cotización. Mercado: **€8.000–15.000 / año** pyme, **€12.000–25.000** mediana, **€20.000+** enterprise | Cifras de integradores, no oficiales |
| LatAm | Contacto `vendasbrasil@tecalliance.net` | Chile no tiene listado público |

Conclusión: para el demo seguimos con la base beta propia. Autofact sirve para **identificar el auto por patente**; TecDoc para **saber qué SKU calza**. Ninguna reemplaza a la otra y ninguna tiene tarifa “por hit” pública.

## ¿Es factible cubrir “todos” los autos?

Sí, como **beta por año/marca/modelo** (el parque chileno útil son unos cientos de generaciones, no cada VIN/trim). No es factible ni deseable afirmar fitment OEM al 100 % sin un catálogo pagado (TecDoc, Autodata, ACES/Pies). Esta versión:

- Cubre ~25 generaciones frecuentes (Hilux, Yaris, Accent, Morning, Ranger, etc.) mapeadas a los SKU EasyComp.
- Si no hay fila, el bot **no inventa** y pide patente o marca/modelo/año.
- Se puede crecer por CSV/seed (`npx tsx scripts/seed-vehicle-fitment.ts`) o `PUT .../catalog/products/:id/fitment`.

## Deploy

| Pieza | Acción |
|-------|--------|
| Migración | `prisma migrate deploy` → `20260921180000_vehicle_fitment_system_events` |
| Seed global | `npm run seed:vehicles` (opcional `TENANT_ID` para vincular SKUs) |
| Env | Opcional `VEHICLE_PLATE_API_URL`, `VEHICLE_PLATE_API_KEY`, `VEHICLE_PLATE_PROVIDER=generic\|boostr` |
| WhatsApp | Nada. Los globos SYSTEM no se envían al cliente. |

Sin API de patentes el bot sigue funcionando: pide marca/modelo/año y usa la base beta.

## Endpoints

Todas con `x-api-key` / `Authorization: Bearer`.

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/vehicles/plates/:plate` | Consulta patente (caché o proveedor). |
| `GET` | `/vehicles/models?q=` | Búsqueda de modelos de la base beta. |
| `POST` | `/conversations/:id/vehicles/lookup` | Body `{ "plate": "BBBB12" }`. Consulta, guarda en el contacto, deja globo azul y devuelve fitment+stock. |
| `GET` | `/businesses/:businessId/vehicles/fitment?make=&model=&year=&plate=&part_type=` | Repuestos compatibles contrastados con catálogo activo. |
| `GET` | `/businesses/:id/catalog/products?make=&model=&year=&plate=` | Mismo filtro sobre el listado de catálogo. |
| `GET/PUT` | `/businesses/:id/catalog/products/:productId/fitment` | Mapeo SKU ↔ part_type / modelo. |

`GET /conversations/:id` incluye los globos: `senderType: "SYSTEM"`, `content_type: "SYSTEM_EVENT"`, `system_event: { kind, actor, title, body, payload }`.

## Kinds de globo

`profile_saved`, `profile_updated`, `handoff`, `mode_changed`, `plate_lookup`, `vehicle_identified`, `fitment_check`, `recommendation`, `suggestion`, `quote_prepared`, `mechanic_note`.

`system_event.actor` es `"BOT"` o `"HUMAN"`. El título ya viene listo: “El bot guardó un dato del contacto” / “El asesor guardó un dato del contacto”.

Acciones que dejan globo:

| Quién | Acción | kind |
|-------|--------|------|
| Bot | Extrae nombre, RUT, patente, etc. del mensaje | `profile_saved` |
| Asesor | `PATCH /businesses/:id/customers/:customerId` (enviar `conversation_id` del chat abierto) | `profile_updated` |

El `PATCH` del asesor persiste el globo como `Message` `SYSTEM` (`appearance: blue_pill`) con `added` / `modified` y valores reales. Puede pisar email/nombre ya cargados. Si `conversation_id` no es de ese contacto → 400. Si el insert del globo falla → no hay 200 (rollback). Nombre/apellido van en `profile_metadata.first_name` / `last_name`.
| Bot | Deriva a humano | `handoff` |
| Asesor | Cambia modo a HUMAN / BOT | `handoff` / `mode_changed` |
| Bot o asesor | Consulta patente o identifica vehículo | `plate_lookup` / `vehicle_identified` |
| Bot o asesor | Envía cotización PDF | `quote_prepared` |

## Perfil automático

Heurísticas por mensaje: `me llamo` / `soy` / `mi nombre es`, RUT, email, dirección, **todas las patentes del mensaje**, VIN. Persistencia `profile_updated_by: "BOT"`. El garage completo está en `profile_metadata` y se expone como `garage` en el GET de cliente.

## Apagar el agente mecánica

En `TenantConfig.configJson`:

```json
{ "mechanic_agent_enabled": false }
```
