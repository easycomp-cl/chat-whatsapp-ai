# ConversAI — Especificación técnica del módulo de Flujos Conversacionales

**Documento para equipos Frontend y Backend**  
**Versión:** 1.0  
**Fecha:** 29-07-2026  
**Producto:** ConversAI  
**Estado:** Propuesta para implementación MVP

---

# 1. Objetivo

Implementar dentro de ConversAI un módulo llamado **Flujos**, orientado a transformar conversaciones en procesos comerciales estructurados.

El módulo permitirá que una conversación pueda:

- Detectar la intención del cliente.
- Activar un flujo manual o automáticamente.
- Analizar mensajes recientes.
- Extraer múltiples datos desde uno o varios mensajes.
- Solicitar solamente la información faltante.
- Validar o confirmar datos ambiguos.
- Ejecutar condiciones.
- Pausar por revisión humana.
- Repetir pasos hasta obtener una respuesta o archivo válido.
- Consultar catálogos, precios, calendarios o APIs externas.
- Generar una salida JSON estructurada.
- Enviar resultados a webhooks, sistemas externos o procesos internos.

La premisa principal es:

> La IA interpreta la conversación, el motor de flujos controla el proceso y el backend ejecuta las acciones deterministas.

---

# 2. Alcance inicial

La primera versión estará enfocada solamente en conversaciones privadas.

## Canales iniciales

- WhatsApp.
- Chat web propio.
- Otros canales futuros mediante un adaptador común.

## Casos de uso iniciales

- Solicitud de cotización.
- Venta de productos personalizados.
- Agendamiento.
- Contratación de servicios.
- Captura de prospectos.
- Solicitudes que requieren aprobación humana.

## Fuera del alcance inicial

- Automatizaciones de comentarios públicos.
- Editor generalista tipo n8n.
- Ejecución directa sobre maquinaria.
- Código personalizado ingresado por usuarios.
- Marketplace público de nodos.
- Automatizaciones completamente ajenas a conversaciones.

---

# 3. Stack tecnológico

## Frontend

- React.
- TypeScript.
- Vite o framework actual del dashboard.
- Vercel.
- React Hook Form.
- Zod.
- TanStack Query.
- dnd-kit.
- `@xyflow/react` para editor visual avanzado.
- Supabase Realtime para estados y revisiones en vivo.

## Backend

- Node.js.
- TypeScript.
- Fastify o framework actual del backend.
- Supabase PostgreSQL.
- Supabase Auth.
- Supabase Storage.
- Redis.
- AWS.
- Worker de procesamiento independiente.
- Proveedor de IA desacoplado.
- Webhooks firmados.

## AWS

AWS podrá utilizarse para:

- ECS, EC2 o Lambda para workers.
- SQS para colas durables si ya está disponible.
- S3 para archivos grandes o almacenamiento externo.
- CloudWatch para logs y métricas.
- Secrets Manager o Parameter Store para credenciales.
- EventBridge para tareas programadas.

## Redis

Redis se utilizará para:

- Locks distribuidos.
- Idempotencia temporal.
- Rate limiting.
- Caché de definiciones de flujos.
- Caché de catálogos y configuraciones.
- Coordinación de workers.
- Estados efímeros de ejecución.

Redis no será la fuente oficial del estado de un flujo. La fuente oficial será PostgreSQL.

---

# 4. Arquitectura general

```text
Canales
WhatsApp / Chat web / futuros canales
                 │
                 ▼
       Normalizador de eventos
                 │
                 ▼
     Persistencia del mensaje
                 │
                 ▼
         Cola de procesamiento
                 │
                 ▼
          Motor de flujos
       ┌─────────┼──────────┐
       ▼         ▼          ▼
   Motor IA   Reglas     Integraciones
       │         │          │
       └─────────┼──────────┘
                 ▼
       Estado de la ejecución
                 │
       ┌─────────┴──────────┐
       ▼                    ▼
 Dashboard              Cliente
```

---

# 5. Principios de diseño

## 5.1 Separar plantilla y ejecución

Una plantilla representa el diseño reutilizable.

Una ejecución representa el estado real de una conversación.

Ejemplo:

```text
Plantilla:
Cotización de tablas personalizadas v3

Ejecución:
Cliente Camila, paso "Revisión de logotipo", estado "Esperando aprobación"
```

## 5.2 Versionamiento inmutable

Una versión publicada no se modifica.

Cuando un usuario edita un flujo publicado:

1. Se crea una nueva versión.
2. Las ejecuciones actuales continúan con la versión anterior.
3. Las nuevas ejecuciones usan la nueva versión.

## 5.3 IA acotada

La IA podrá:

- Detectar intención.
- Extraer datos.
- Interpretar correcciones.
- Clasificar respuestas.
- Agrupar preguntas.
- Redactar respuestas.

La IA no podrá decidir por sí sola:

- Precios.
- Descuentos.
- Disponibilidad real.
- Parámetros de producción.
- Creación definitiva de citas sin validación.
- Aprobaciones comerciales.

## 5.4 Acciones deterministas

Las operaciones críticas se ejecutarán desde código y reglas del backend.

Ejemplos:

- Cálculo de precios.
- Consulta de disponibilidad.
- Creación de eventos.
- Generación de cotizaciones.
- Envío a webhooks.
- Creación de órdenes.

---

# 6. Experiencia de creación de flujos

La creación de un flujo tendrá cuatro etapas.

```text
1. Wizard
2. Configuración de datos e integraciones
3. Generación automática
4. Simulación y publicación
```

---

# 7. Wizard de creación

## Paso 1: Objetivo

Opciones iniciales:

- Generar cotización.
- Vender producto.
- Reservar una hora.
- Contratar servicio.
- Recopilar información.
- Crear solicitud interna.
- Otro objetivo.

## Paso 2: Activadores

El usuario podrá elegir:

- Activación manual desde el chat.
- Detección de intención mediante IA.
- Frases o palabras clave.
- Evento externo.
- Webhook.
- API.

## Paso 3: Campos necesarios

Ejemplo para producto personalizado:

### Cliente

- Nombre.
- Teléfono.
- Correo.

### Producto

- Tipo.
- Modelo.
- Material.
- Tamaño.
- Cantidad.
- Personalización.
- Archivo.
- Fecha requerida.

### Entrega

- Retiro o despacho.
- Dirección.
- Comuna.
- Región.

## Paso 4: Información precargada

El usuario podrá configurar:

- Productos.
- Variantes.
- Precios.
- Tiempos de producción.
- Fechas disponibles.
- Zonas de despacho.
- Reglas.
- Descuentos autorizados.
- Integraciones.

## Paso 5: Revisión humana

El usuario podrá definir qué elementos deben revisarse.

Ejemplos:

- Logotipos.
- Archivos gráficos.
- Diseños especiales.
- Pedidos sobre cierta cantidad.
- Cotizaciones sobre cierto monto.
- Fechas de entrega especiales.

## Paso 6: Método de cálculo

- Catálogo y reglas.
- API externa.
- Revisión humana.
- Sin cálculo automático.

## Paso 7: Acción final

- Guardar solicitud.
- Generar JSON.
- Crear cotización.
- Notificar vendedor.
- Enviar webhook.
- Crear cita.
- Crear tarea.
- Crear orden interna.

---

# 8. Editor de flujos

## 8.1 Vista simple

Será la vista principal del MVP.

```text
1. Detectar intención
2. Analizar conversación
3. Recopilar información
4. Solicitar archivo
5. Revisar archivo
6. Calcular precio
7. Confirmar
8. Generar resultado
```

Características:

- Reordenamiento vertical con dnd-kit.
- Activar o desactivar pasos.
- Configuración mediante formularios.
- Condiciones construidas como frases.
- Vista previa del chat.
- Simulación.

## 8.2 Vista avanzada

Se implementará posteriormente con `@xyflow/react`.

Permitirá:

- Arrastrar nodos.
- Conectar ramas.
- Crear condiciones.
- Crear loops.
- Visualizar revisiones.
- Inspeccionar variables.
- Depurar ejecuciones.

Ambas vistas deberán editar la misma definición interna.

---

# 9. Tipos de nodos

```ts
export type FlowNodeType =
  | "start"
  | "message"
  | "collect_fields"
  | "choice"
  | "condition"
  | "review"
  | "action"
  | "wait"
  | "handoff"
  | "confirmation"
  | "emit_event"
  | "end";
```

## Descripción

| Nodo | Función |
|---|---|
| start | Punto inicial |
| message | Enviar mensaje |
| collect_fields | Extraer y solicitar información |
| choice | Presentar opciones |
| condition | Dividir el flujo |
| review | Solicitar revisión humana |
| action | Ejecutar una integración o regla |
| wait | Esperar un evento |
| handoff | Derivar a humano |
| confirmation | Confirmar resumen |
| emit_event | Generar una salida |
| end | Finalizar |

---

# 10. Captura inteligente de información

Al iniciar o avanzar un flujo, el sistema podrá revisar:

- Mensaje actual.
- Mensajes recientes.
- Datos del contacto.
- Variables ya capturadas.
- Correcciones anteriores.
- Archivos adjuntos.

Configuración sugerida:

```json
{
  "contextWindow": {
    "maxMessages": 30,
    "maxAgeMinutes": 30,
    "includeContactProfile": true
  }
}
```

La antigüedad no será el único criterio. También se debe considerar:

- Relevancia semántica.
- Cambio de tema.
- Corrección explícita.
- Fuente.
- Fecha.
- Estado de confirmación.

---

# 11. Slot filling

Cada dato será tratado como un campo o slot.

```ts
export type SlotStatus =
  | "missing"
  | "inferred"
  | "captured"
  | "needs_confirmation"
  | "confirmed"
  | "rejected"
  | "corrected";
```

## Estructura

```ts
export interface FlowSlotValue {
  key: string;
  value: unknown;
  status: SlotStatus;
  confidence: number;
  sourceMessageId?: string;
  sourceType:
    | "current_message"
    | "recent_conversation"
    | "contact_profile"
    | "human"
    | "integration"
    | "ai_inference";
  updatedAt: string;
}
```

## Prioridad

1. Corrección explícita más reciente.
2. Confirmación dentro del flujo.
3. Mensaje actual.
4. Conversación reciente.
5. Datos históricos.
6. Inferencia.

---

# 12. Confirmación agrupada

El sistema evitará confirmar cada campo por separado.

Ejemplo:

```text
Entendí que necesitas 8 tablas de raulí de 40 × 25 cm,
con el logo de tu empresa y despacho a Talca.

¿Está correcto?
```

Si el usuario responde:

```text
Sí, pero son 10 tablas.
```

El sistema actualizará solamente `quantity`.

---

# 13. Loops y revisiones

Los loops no se mostrarán inicialmente como instrucciones técnicas.

La interfaz utilizará:

> Repetir hasta aprobar.

Ejemplo:

```text
Solicitar logotipo
        ↓
Revisar logotipo
        ↓
¿Está aprobado?
  ├── Sí → Calcular cotización
  └── No → Solicitar otro archivo
                  ↓
          Volver a revisar
```

## Configuración

```json
{
  "id": "review-logo",
  "type": "review",
  "config": {
    "subjectField": "engraving.logoFile",
    "reviewMode": "human",
    "maxAttempts": 3,
    "approvedNextNodeId": "calculate-quote",
    "rejectedNextNodeId": "request-new-logo",
    "onMaxAttemptsNodeId": "human-handoff"
  }
}
```

## Estados

```ts
export type ReviewStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "expired";
```

---

# 14. Ejemplo de flujo: tablas de madera grabadas

## Objetivo

Generar una cotización para tablas personalizadas.

## Campos requeridos

- Nombre.
- Tipo de tabla.
- Madera.
- Tamaño.
- Cantidad.
- Tipo de grabado.
- Texto o archivo.
- Fecha requerida.
- Método de entrega.
- Dirección.

## Flujo

```text
Inicio
  │
  ▼
Analizar conversación reciente
  │
  ▼
Extraer datos disponibles
  │
  ▼
Preguntar solamente datos faltantes
  │
  ▼
¿Grabado con texto o logotipo?
  ├── Texto → Capturar texto
  └── Logo → Solicitar archivo
                  │
                  ▼
            Revisar archivo
              ├── Aprobado
              ├── Solicitar cambios
              └── Rechazado
  │
  ▼
Consultar catálogo y reglas
  │
  ▼
Calcular cotización
  │
  ▼
Confirmar resumen
  │
  ▼
Generar JSON
```

---

# 15. Ejemplo de salida JSON

```json
{
  "schemaVersion": "1.0",
  "eventType": "quote.confirmed",
  "eventId": "evt_01K1B7Q7YB2A",
  "createdAt": "2026-07-29T18:42:17Z",
  "organization": {
    "id": "org_maderas_del_maule"
  },
  "conversation": {
    "id": "conv_894321",
    "channel": "whatsapp",
    "contactId": "contact_48291"
  },
  "flow": {
    "definitionId": "flow_custom_wood_quote",
    "version": 3,
    "runId": "run_78561"
  },
  "customer": {
    "name": "Camila",
    "phone": "+56912345678",
    "email": null
  },
  "quote": {
    "currency": "CLP",
    "items": [
      {
        "sku": "TPM-RAULI-40X25",
        "name": "Tabla parrillera de raulí",
        "quantity": 8,
        "unitPrice": 32000,
        "subtotal": 256000,
        "customization": {
          "type": "logo",
          "fileId": "file_logo_1827",
          "reviewStatus": "approved",
          "requiresAdaptation": true,
          "adaptationPrice": 15000
        }
      }
    ],
    "delivery": {
      "method": "delivery",
      "requiredDate": "2026-08-31",
      "address": {
        "street": "2 Norte",
        "number": "1450",
        "city": "Talca",
        "region": "Maule",
        "country": "CL"
      }
    },
    "pricing": {
      "itemsSubtotal": 256000,
      "customizationSubtotal": 15000,
      "deliverySubtotal": 5000,
      "total": 276000
    }
  },
  "confirmation": {
    "confirmedByCustomer": true,
    "confirmedAt": "2026-07-29T18:41:52Z"
  },
  "nextAction": {
    "type": "create_production_request",
    "requiresHumanApproval": true
  }
}
```

---

# 16. Modelo de datos

## `flow_definitions`

```sql
create table flow_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  description text,
  status text not null default 'draft',
  current_version_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## `flow_versions`

```sql
create table flow_versions (
  id uuid primary key default gen_random_uuid(),
  flow_definition_id uuid not null references flow_definitions(id),
  version_number integer not null,
  graph_json jsonb not null,
  status text not null default 'draft',
  published_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(flow_definition_id, version_number)
);
```

## `flow_triggers`

```sql
create table flow_triggers (
  id uuid primary key default gen_random_uuid(),
  flow_version_id uuid not null references flow_versions(id),
  trigger_type text not null,
  channel text,
  priority integer not null default 100,
  configuration_json jsonb not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
```

## `flow_runs`

```sql
create table flow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  flow_version_id uuid not null references flow_versions(id),
  conversation_id uuid not null,
  contact_id uuid,
  current_node_id text,
  status text not null,
  variables_json jsonb not null default '{}'::jsonb,
  started_by text not null,
  lock_version integer not null default 0,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
```

## `flow_run_events`

```sql
create table flow_run_events (
  id uuid primary key default gen_random_uuid(),
  flow_run_id uuid not null references flow_runs(id),
  node_id text,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  platform_message_id text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique(idempotency_key)
);
```

## `flow_reviews`

```sql
create table flow_reviews (
  id uuid primary key default gen_random_uuid(),
  flow_run_id uuid not null references flow_runs(id),
  node_id text not null,
  reviewer_role text,
  reviewer_user_id uuid,
  subject_type text not null,
  subject_reference text,
  status text not null default 'pending',
  resolution text,
  notes text,
  attempt integer not null default 1,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

## `flow_tasks`

```sql
create table flow_tasks (
  id uuid primary key default gen_random_uuid(),
  flow_run_id uuid not null references flow_runs(id),
  node_id text not null,
  task_type text not null,
  status text not null default 'pending',
  due_at timestamptz,
  attempt_count integer not null default 0,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## `flow_catalogs`

```sql
create table flow_catalogs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## `flow_catalog_items`

```sql
create table flow_catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references flow_catalogs(id),
  sku text,
  name text not null,
  description text,
  price numeric(14,2),
  currency text not null default 'CLP',
  attributes_json jsonb not null default '{}'::jsonb,
  rules_json jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

# 17. Row Level Security

Todas las tablas multitenant deberán tener `organization_id` directo o accesible mediante una relación.

Reglas mínimas:

- Un usuario solo puede leer flujos de su organización.
- Solo administradores pueden publicar o eliminar.
- Agentes pueden ejecutar y revisar.
- La service role se utilizará solamente desde backend.
- Nunca exponer claves de proveedor ni secrets en frontend.

---

# 18. Contrato de definición de flujo

```ts
export interface FlowDefinition {
  id: string;
  name: string;
  version: number;
  trigger: FlowTriggerConfig;
  context: FlowContextConfig;
  fields: FlowFieldDefinition[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  outputSchemas: FlowOutputSchema[];
}
```

## Campo

```ts
export interface FlowFieldDefinition {
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "email"
    | "phone"
    | "address"
    | "option"
    | "multi_option"
    | "file"
    | "object";
  required: boolean;
  options?: string[];
  requiredWhen?: FlowCondition;
  validation?: Record<string, unknown>;
}
```

## Condición

```ts
export interface FlowCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "greater_than"
    | "less_than"
    | "in"
    | "not_in"
    | "exists"
    | "not_exists";
  value?: unknown;
}
```

---

# 19. API Backend

## Flujos

```http
GET    /api/flows
POST   /api/flows
GET    /api/flows/:flowId
PATCH  /api/flows/:flowId
DELETE /api/flows/:flowId
```

## Versiones

```http
POST /api/flows/:flowId/versions
GET  /api/flows/:flowId/versions
GET  /api/flows/:flowId/versions/:versionId
POST /api/flows/:flowId/versions/:versionId/publish
POST /api/flows/:flowId/versions/:versionId/clone
```

## Simulación

```http
POST /api/flows/:flowId/simulate
```

Request:

```json
{
  "messages": [
    {
      "role": "customer",
      "content": "Quiero 8 tablas de raulí con mi logo",
      "createdAt": "2026-07-29T18:30:00Z"
    }
  ]
}
```

Response:

```json
{
  "detectedIntent": "request_custom_quote",
  "capturedFields": {},
  "missingFields": [],
  "currentNodeId": "collect-fields",
  "nextMessage": "..."
}
```

## Ejecuciones

```http
POST /api/conversations/:conversationId/flows/:flowId/start
GET  /api/flow-runs/:runId
POST /api/flow-runs/:runId/pause
POST /api/flow-runs/:runId/resume
POST /api/flow-runs/:runId/cancel
POST /api/flow-runs/:runId/retry
```

## Revisiones

```http
GET  /api/flow-reviews
GET  /api/flow-reviews/:reviewId
POST /api/flow-reviews/:reviewId/resolve
```

## Catálogo

```http
GET    /api/catalogs
POST   /api/catalogs
GET    /api/catalogs/:catalogId/items
POST   /api/catalogs/:catalogId/items
PATCH  /api/catalog-items/:itemId
DELETE /api/catalog-items/:itemId
```

## Integraciones

```http
GET  /api/integrations
POST /api/integrations/calendar/connect
POST /api/integrations/webhooks
POST /api/integrations/custom-api/test
```

---

# 20. Motor de ejecución

## Interfaz principal

```ts
export interface FlowEngine {
  start(input: StartFlowInput): Promise<FlowRun>;
  processEvent(input: ProcessFlowEventInput): Promise<FlowRunResult>;
  pause(runId: string): Promise<void>;
  resume(runId: string, event: FlowEvent): Promise<FlowRunResult>;
  cancel(runId: string): Promise<void>;
}
```

## Flujo de procesamiento

```text
Recibir evento
    ↓
Validar idempotencia
    ↓
Adquirir lock
    ↓
Cargar ejecución
    ↓
Cargar definición versionada
    ↓
Procesar nodo actual
    ↓
Persistir cambios
    ↓
Liberar lock
    ↓
Encolar acciones salientes
```

---

# 21. Locks e idempotencia

## Idempotencia

Clave sugerida:

```text
organizationId + channel + platformMessageId
```

## Redis lock

```text
flow-run-lock:{runId}
```

Características:

- TTL corto.
- Renovación si el procesamiento continúa.
- Fallback con `lock_version` optimista en PostgreSQL.
- Nunca confiar solamente en Redis para consistencia.

---

# 22. Cola de procesamiento

Usar una de estas alternativas según infraestructura existente:

## Opción preferida si AWS ya está consolidado

- AWS SQS.
- Dead Letter Queue.
- Workers en ECS, EC2 o Lambda.

## Opción alternativa

- Supabase Queues.

## Tipos de trabajos

- `incoming_message`.
- `flow_event`.
- `ai_extraction`.
- `send_message`.
- `review_requested`.
- `webhook_delivery`.
- `calendar_sync`.
- `document_generation`.

---

# 23. Integración con IA

El proveedor debe estar desacoplado.

```ts
export interface AiProvider {
  detectIntent(input: DetectIntentInput): Promise<IntentResult>;
  extractFields(input: ExtractFieldsInput): Promise<FieldExtractionResult>;
  interpretCorrection(input: CorrectionInput): Promise<CorrectionResult>;
  composeMessage(input: ComposeMessageInput): Promise<string>;
}
```

La salida debe ser estructurada y validada con Zod.

```ts
export const extractionSchema = z.object({
  fields: z.record(
    z.object({
      value: z.unknown().nullable(),
      confidence: z.number().min(0).max(1),
      sourceMessageId: z.string().nullable(),
      needsConfirmation: z.boolean()
    })
  ),
  missingFields: z.array(z.string()),
  contradictions: z.array(
    z.object({
      field: z.string(),
      values: z.array(z.unknown())
    })
  )
});
```

---

# 24. Integración de calendario

## Flujo

```text
Interpretar fecha solicitada
        ↓
Consultar disponibilidad
        ↓
Ofrecer horarios
        ↓
Cliente selecciona
        ↓
Volver a validar disponibilidad
        ↓
Crear evento
```

## Proveedores iniciales

- Google Calendar.
- Calendario interno de ConversAI.
- API personalizada.

## Reglas

- Duración.
- Horarios.
- Días disponibles.
- Bloqueos.
- Anticipación mínima.
- Tiempo entre citas.
- Zona horaria.
- Capacidad.

---

# 25. Webhooks salientes

## Headers

```http
Content-Type: application/json
X-ConversAI-Event: quote.confirmed
X-ConversAI-Delivery-Id: delivery_123
X-ConversAI-Signature: sha256=...
```

## Reintentos

- Backoff exponencial.
- Máximo configurable.
- Registro por intento.
- Dead letter.
- Reenvío manual desde dashboard.

## Seguridad

- HMAC SHA-256.
- Timestamp.
- Protección contra replay.
- Secret por integración.

---

# 26. Frontend

## Rutas sugeridas

```text
/flows
/flows/new
/flows/:flowId
/flows/:flowId/wizard
/flows/:flowId/editor
/flows/:flowId/simulator
/flows/:flowId/executions
/flows/reviews
/catalogs
/integrations
```

## Componentes principales

```text
FlowList
FlowWizard
FlowStepEditor
FlowNodeEditor
FlowConditionBuilder
FlowFieldBuilder
FlowSimulator
FlowRunTimeline
FlowReviewInbox
CatalogManager
IntegrationManager
JsonOutputPreview
```

## Estado

- TanStack Query para datos remotos.
- Estado local para edición en borrador.
- Autosave con debounce.
- Validación con Zod.
- Control de cambios sin publicar.

---

# 27. Constructor de condiciones

La interfaz debe mostrar frases.

Ejemplo:

```text
Cuando:

[ Cantidad ] [ sea mayor que ] [ 20 ]

Entonces:

[ Solicitar aprobación ]
```

No se debe exponer código.

El usuario podrá escribir una regla en lenguaje natural y la IA podrá proponer una estructura, pero deberá mostrar una vista previa antes de guardar.

---

# 28. Simulador

El simulador permitirá probar conversaciones antes de publicar.

Debe mostrar:

- Intención detectada.
- Campos extraídos.
- Campos faltantes.
- Campos dudosos.
- Nodo actual.
- Condición evaluada.
- Próximo nodo.
- Mensaje generado.
- JSON de salida.
- Logs técnicos opcionales.

## Modos

- Vista cliente.
- Vista técnica.
- Casos guardados.
- Repetir prueba.
- Comparar versión anterior.

---

# 29. Bandeja de revisiones

Vista sugerida:

```text
Revisiones pendientes

Cliente: Camila
Flujo: Cotización de tablas
Elemento: Logotipo
Estado: Pendiente
Recibido: hace 8 minutos

[Ver archivo]
[Aprobar]
[Solicitar cambios]
[Rechazar]
```

La resolución debe continuar automáticamente la ejecución.

---

# 30. Observabilidad

## Logs

Cada ejecución debe registrar:

- Inicio.
- Nodo ejecutado.
- Variables modificadas.
- Llamada a IA.
- Acción ejecutada.
- Error.
- Reintento.
- Pausa.
- Reanudación.
- Fin.

## Métricas

- Flujos iniciados.
- Flujos completados.
- Tasa de abandono.
- Tiempo promedio.
- Nodos con mayor abandono.
- Revisiones pendientes.
- Errores por integración.
- Consumo de IA.
- Tiempo ahorrado estimado.

## AWS

- CloudWatch Logs.
- CloudWatch Metrics.
- Alarmas.
- Correlation ID por ejecución.

---

# 31. Seguridad

- Validación estricta de todos los inputs.
- RLS en Supabase.
- Cifrado de secrets.
- URLs firmadas para archivos.
- Sanitización de nombres de archivo.
- Límites de tamaño y MIME.
- Antivirus o escaneo opcional.
- Rate limiting.
- Auditoría.
- Separación por organización.
- HMAC en webhooks.
- No exponer service role.
- No permitir código arbitrario.
- No ejecutar parámetros de maquinaria sin aprobación humana.

---

# 32. Manejo de errores

Cada nodo deberá definir:

```ts
export interface NodeErrorPolicy {
  maxAttempts: number;
  retryStrategy: "none" | "fixed" | "exponential";
  onFailure:
    | "pause"
    | "handoff"
    | "skip"
    | "cancel"
    | "go_to_node";
  fallbackNodeId?: string;
}
```

Ejemplos:

- API externa caída → reintentar.
- Calendario sin disponibilidad → ofrecer otra fecha.
- IA no interpreta → solicitar aclaración.
- Archivo inválido → pedir nuevo archivo.
- Precio no disponible → revisión humana.

---

# 33. Estructura sugerida del backend

```text
src/
  modules/
    flows/
      domain/
        flow-definition.ts
        flow-version.ts
        flow-run.ts
        flow-event.ts
        flow-slot.ts
        flow-review.ts

      application/
        create-flow.ts
        publish-flow.ts
        start-flow.ts
        process-flow-event.ts
        execute-node.ts
        pause-flow.ts
        resume-flow.ts
        cancel-flow.ts
        simulate-flow.ts

      infrastructure/
        flow.repository.ts
        flow-version.repository.ts
        flow-run.repository.ts
        flow-event.repository.ts
        redis-lock.service.ts
        queue.service.ts

      executors/
        message.executor.ts
        collect-fields.executor.ts
        choice.executor.ts
        condition.executor.ts
        review.executor.ts
        action.executor.ts
        wait.executor.ts
        confirmation.executor.ts
        emit-event.executor.ts
        end.executor.ts

      triggers/
        manual.trigger.ts
        ai-intent.trigger.ts
        keyword.trigger.ts
        api.trigger.ts

      integrations/
        calendar/
        webhooks/
        catalogs/
        custom-api/

      ai/
        ai-provider.ts
        extraction.service.ts
        intent.service.ts
        correction.service.ts
```

---

# 34. Roadmap

## Fase 1 — MVP

- Wizard.
- Plantillas.
- Campos personalizados.
- Captura inteligente.
- Vista simple.
- Condiciones básicas.
- Revisión humana.
- Loop de corrección.
- Catálogo.
- Reglas de precio.
- Salida JSON.
- Webhooks.
- Simulador.
- Versionamiento.
- Ejecución manual y automática.

## Fase 2 — Editor visual

- React Flow.
- Ramas.
- Conexiones.
- Variables.
- Subflujos.
- Depuración visual.
- Clonación.
- Plantillas por rubro.

## Fase 3 — Plataforma

- Calendarios.
- CRM.
- Pagos.
- Documentos.
- Analítica avanzada.
- Recomendaciones con IA.
- Integraciones públicas.
- Acciones reutilizables.

---

# 35. Criterios de aceptación del MVP

## Creación

- El usuario puede crear un flujo desde un wizard.
- El usuario puede guardar como borrador.
- El usuario puede publicar una versión.
- Publicar una modificación crea una nueva versión.

## Ejecución

- El flujo puede activarse manualmente.
- El flujo puede activarse por intención.
- El sistema analiza mensajes recientes.
- Extrae múltiples datos de un mismo mensaje.
- Pregunta solamente campos faltantes.
- Permite corregir datos.
- Guarda la fuente de cada dato.

## Condiciones

- El usuario puede definir condiciones sin escribir código.
- Las condiciones soportan texto, número, fecha, opción y archivos.
- El motor evita loops infinitos.

## Revisión

- Una ejecución puede pausarse.
- Se puede aprobar, rechazar o solicitar cambios.
- La ejecución continúa desde el punto correcto.
- Existe un máximo de intentos configurable.

## Integraciones

- El sistema puede consultar un catálogo.
- El sistema puede generar JSON.
- El sistema puede enviar un webhook firmado.
- Los envíos fallidos pueden reintentarse.

## Seguridad

- Los datos están aislados por organización.
- El frontend no recibe secrets.
- Los archivos usan acceso firmado.
- Las acciones críticas quedan auditadas.

## Observabilidad

- Cada ejecución tiene timeline.
- Los errores son visibles.
- El administrador puede reintentar.
- Existe correlation ID.

---

# 36. Propuesta de valor del módulo

ConversAI no busca reemplazar herramientas generalistas de automatización.

Busca resolver procesos concretos de negocio desde una conversación.

> El usuario configura el objetivo, los datos necesarios, las reglas y las revisiones. ConversAI interpreta al cliente, completa el proceso y entrega una solicitud, cotización, reserva o resultado estructurado.

La ventaja competitiva será:

- Menor complejidad.
- Menor costo de implementación.
- Uso directo por emprendedores.
- Integración con conversaciones reales.
- Plantillas por industria.
- IA utilizada como apoyo, no como fuente de decisiones críticas.
- Capacidad de crecer desde una automatización simple hasta integraciones profesionales.

---

# 37. Decisión técnica recomendada

Para el MVP:

```text
Frontend:
React + TypeScript + Vercel
React Hook Form + Zod
dnd-kit
React Flow en fase avanzada
TanStack Query
Supabase Realtime

Backend:
Node.js + TypeScript
Supabase PostgreSQL
Supabase Storage
Redis
AWS SQS o Supabase Queues
Workers en AWS
Motor de flujos propio
Proveedor IA desacoplado
Webhooks firmados
```

La fuente oficial será PostgreSQL.

Redis será utilizado solamente para caché, locks e información efímera.

AWS alojará los workers, colas, logs, secrets y procesos que requieran mayor control operacional.

El frontend administrará la configuración, simulación y visualización; nunca ejecutará la lógica del flujo directamente.

---

# 38. Resultado esperado

Al finalizar el MVP, un negocio deberá poder crear un flujo como:

```text
Cuando un cliente quiera cotizar una tabla personalizada:

1. Revisar lo que ya dijo.
2. Extraer producto, tamaño, cantidad y fecha.
3. Preguntar solamente lo faltante.
4. Solicitar el logotipo.
5. Pausar para revisión.
6. Solicitar otro archivo si es necesario.
7. Consultar precios.
8. Mostrar una cotización.
9. Confirmar.
10. Generar un JSON y enviarlo al sistema del negocio.
```

Todo esto sin que el usuario tenga que programar, conocer APIs ni construir un flujo técnico tipo n8n.
