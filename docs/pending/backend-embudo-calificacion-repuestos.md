# Backend — Embudo de calificación anti-alucinación (repuestos)

**Estado:** implementado  
**UI:** sin cambios obligatorios; los globos `profile_saved` (azul) y `plate_lookup` (negro/azul) ya están documentados en [../to-front/chat-eventos-sistema-y-vehiculos-ui.md](../to-front/chat-eventos-sistema-y-vehiculos-ui.md).

## Resumen

El runtime guía al bot con un embudo de slots (`name` → `need` → `vehicle` → `delivery_preference`), oculta el catálogo de repuestos hasta identificar el vehículo, y sigue capturando datos nuevos con globos de sistema.

## Qué hace

1. **Saludo cliente nuevo** sin nombre conocido: pide nombre + en qué ayudar.
2. **Bloque `EMBUDO DE CALIFICACIÓN`** en el system prompt con datos conocidos, faltantes y la pregunta prioritaria.
3. **Anti-alucinación:** si habla de repuestos sin patente/marca-modelo-año, no se inyecta RAG de productos y se prohíbe listar SKUs.
4. **Extracción inbound ampliada:** nombre informal (`Camila por acá`, `te habla…`), necesidad, preferencia retiro/despacho → `profile_saved` (píldora azul).
5. **Patente con datos** → tarjeta oscura (flujo mecánica existente); sin datos de API → píldora azul.
6. FAQ se omite cuando el mensaje es de repuestos y aún falta vehículo (evita respuestas genéricas incorrectas).

## Archivos

| Ruta | Cambio |
|------|--------|
| `src/modules/runtime/qualification.ts` | Nuevo: estado de slots + bloque prompt + saludo |
| `src/modules/runtime/prompts.ts` | Fuentes de verdad + restricción de catálogo |
| `src/modules/runtime/response-pipeline.service.ts` | Cablea embudo, bloquea FAQ/RAG prematuro |
| `src/modules/customers/customer-profile-extract.service.ts` | Más patrones de nombre + need + delivery |
| `src/modules/vehicles/mechanic-agent.service.ts` | Hint anti-alucinación al pedir patente |
| `tests/qualification-funnel.test.ts` | Cobertura del embudo |

## Cómo probar

1. Cliente nuevo: `hola` → debe pedir nombre.
2. `necesito pastillas` → pide patente (sin listar SKUs inventados).
3. `me llamo Camila, BB BB 12` → globo azul (nombre/necesidad) + tarjeta oscura si la API/caché trae marca-modelo.
4. Con fitment: ofrece cotización PDF y retiro/despacho.
5. `npx vitest run tests/qualification-funnel.test.ts tests/vehicle-mechanic-beta.test.ts`
