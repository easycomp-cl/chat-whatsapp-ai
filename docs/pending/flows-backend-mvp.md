# Módulo Flujos — Contrato backend MVP

**Estado:** PR1–PR8 completados (MVP backend listo para consumo UI)  
**Spec UI:** [flows-ui-mvp.md](../to-front/flows-ui-mvp.md)
**Spec origen:** [ConversAI_Especificacion_Modulo_Flujos.md](./ConversAI_Especificacion_Modulo_Flujos.md)  
**Canal MVP:** Solo WhatsApp  
**Audiencia:** Equipo backend + equipo UI (front en repo hermano; ver [flows-ui-mvp.md](../to-front/flows-ui-mvp.md))

---

## Resumen

Backend para flujos conversacionales versionados, con ejecución por conversación WhatsApp, captura inteligente de datos, revisión humana, input de agente vía “globo” (sin pasar a modo HUMAN), catálogo existente, webhooks salientes y triggers externos.

La IA interpreta; el motor de flujos controla el proceso; el backend ejecuta acciones deterministas.

---

## Decisiones cerradas

| Tema | Decisión |
|------|----------|
| Canal | Solo WhatsApp en MVP |
| Multitenancy | `tenantId` en todas las tablas; rutas bajo `/businesses/:businessId/...` |
| Catálogo | Reutilizar `TenantCatalogProduct` + delivery existente |
| `created_by` | Solo `createdByAdminId` → `TenantAdmin.id` (rol admin por ahora) |
| Runs por chat | Máximo 1 run activo por conversación |
| Modo conversación con flujo activo | Permanece en **BOT** aunque haya `awaiting_agent_input` o revisiones |
| Pasar a HUMAN | Solo nodo `handoff` o fin/cancelación del flujo; **bloqueado** `PATCH mode=HUMAN` si hay run activo |
| Choice / confirmación WA | Solo texto plano |
| Calendario | Omitido en MVP (fecha como texto) |
| Storage archivos | Supabase Storage (bucket `flow-files`) |
| Caso referencia | Cotización tablas personalizadas (§14 spec) |
| Triggers externos | Webhook HMAC + API start en MVP |

---

## Modelo de datos (Prisma)

Migración: `prisma/migrations/20260729180000_flows_module/`

| Tabla | Propósito |
|-------|-----------|
| `FlowDefinition` | Plantilla del flujo (nombre, estado, versión publicada actual) |
| `FlowVersion` | Versión inmutable con `graphJson` |
| `FlowTrigger` | Activadores por versión (manual, keyword, IA, webhook, API) |
| `FlowRun` | Ejecución en una conversación |
| `FlowRunEvent` | Timeline / auditoría / idempotencia |
| `FlowReview` | Revisiones humanas (logo, monto, etc.) |
| `FlowTask` | Tareas async (webhook delivery, etc.) |
| `FlowFile` | Metadatos de archivos en Supabase Storage |
| `Conversation.activeFlowRunId` | Puntero al run activo |

**Índice parcial:** un solo run no terminal por `conversationId`.

---

## Reglas de negocio críticas

### 1. Flujo activo vs modo BOT/HUMAN

```text
Si Conversation.activeFlowRunId IS NOT NULL:
  - PATCH /conversations/:id/mode → HUMAN → 409 Conflict
  - El pipeline FAQ/RAG/IA no corre (solo FlowEngine)
  - awaiting_agent_input NO cambia mode a HUMAN
  - El globo de agente es UI; el mensaje se envía como BOT (senderType=BOT)

Solo el nodo handoff:
  - Cambia Conversation.mode → HUMAN
  - Opcional: asigna admin, notifica handoff
  - Puede pausar o cancelar el run según config del nodo
```

### 2. Globo de input de agente (`awaiting_agent_input`)

Cuando un nodo `message` tiene plantilla con `requiredFields` sin valor:

1. `FlowRun.status` → `AWAITING_AGENT_INPUT`
2. `pendingAgentInputJson` guarda template + campos + prefilled
3. Inbox expone `activeFlowRun.pendingAgentInput`
4. Agente completa → `POST .../flow-runs/:runId/agent-input`
5. Backend interpola, envía WA, persiste mensaje (`senderType=BOT`), avanza flujo

### 3. Permisos (admin)

CRUD de flujos, publicar, triggers: requiere `TenantAdmin.role` en `tenant_admin` (o equivalente acordado con UI). Colaboradores pueden resolver revisiones y enviar `agent-input` si se define después.

---

## API REST (convención del proyecto)

Todas requieren header `X-API-Key: $INTERNAL_API_KEY`.

### Definiciones

```http
GET    /businesses/:businessId/flows
POST   /businesses/:businessId/flows
GET    /businesses/:businessId/flows/:flowId
PATCH  /businesses/:businessId/flows/:flowId
DELETE /businesses/:businessId/flows/:flowId
```

`POST` body mínimo:

```json
{
  "name": "Cotización tablas personalizadas",
  "description": "Captura datos, revisa logo, calcula precio",
  "created_by_admin_id": "cuid_del_admin",
  "template": "wood_quote"
}
```

`template` opcional: `default` | `wood_quote`.

### Versiones

```http
POST   /businesses/:businessId/flows/:flowId/versions
GET    /businesses/:businessId/flows/:flowId/versions
GET    /businesses/:businessId/flows/:flowId/versions/:versionId
PATCH  /businesses/:businessId/flows/:flowId/versions/:versionId
POST   /businesses/:businessId/flows/:flowId/versions/:versionId/publish
POST   /businesses/:businessId/flows/:flowId/simulate
```

Publicar: `{ "published_by_admin_id": "cuid_del_admin" }`

`graph_json` sigue contrato `FlowDefinition` de la spec (§18): `nodes`, `edges`, `fields`, `trigger`, `outputSchemas`.

### Ejecución

```http
POST   /businesses/:businessId/conversations/:conversationId/flows/:flowId/start
GET    /businesses/:businessId/flow-runs/:runId
POST   /businesses/:businessId/flow-runs/:runId/pause
POST   /businesses/:businessId/flow-runs/:runId/resume
POST   /businesses/:businessId/flow-runs/:runId/cancel
POST   /businesses/:businessId/flow-runs/:runId/retry
POST   /businesses/:businessId/flow-runs/:runId/agent-input
```

`agent-input` y `resolve` envían las respuestas del motor por WhatsApp (`sent_messages` en la respuesta JSON).

### Revisiones y archivos

```http
GET    /businesses/:businessId/flow-reviews?status=PENDING
POST   /businesses/:businessId/flow-reviews/:reviewId/resolve
GET    /businesses/:businessId/flow-files/:fileId/signed-url?expires_in=3600
```

`GET flow-reviews` incluye `file.signed_url` cuando `subject_type=file` y Supabase está configurado.

### Triggers externos (MVP)

```http
POST   /businesses/:businessId/flows/:flowId/start-by-api
POST   /webhooks/flows/:triggerId
```

`start-by-api`: API key interna (`x-api-key`) + body con `conversation_id` o `customer_phone`.  
`webhooks/flows/:triggerId`: firma HMAC `X-ConversAI-Signature` (sha256 del body con secreto del trigger).  
Idempotencia opcional: `idempotency_key` en body o header `X-ConversAI-Idempotency-Key`.

### Webhooks salientes (PR8)

```http
PUT    /businesses/:businessId/integrations/flow-webhook
GET    /businesses/:businessId/integrations/flow-webhook
GET    /businesses/:businessId/flow-webhook-deliveries?status=FAILED&flow_run_id=...
GET    /businesses/:businessId/flow-webhook-deliveries/:deliveryId
POST   /businesses/:businessId/flow-webhook-deliveries/:deliveryId/retry
```

El nodo `emit_event` encola entrega POST firmada cuando existe integración `FLOW_WEBHOOK` activa.

Headers salientes:

```http
X-ConversAI-Event: quote.confirmed
X-ConversAI-Delivery-Id: <deliveryId>
X-ConversAI-Timestamp: <unix-seconds>
X-ConversAI-Signature: sha256=<hmac(timestamp + "." + body)>
```

Reintentos: BullMQ cola `flow-webhook-delivery`, backoff exponencial (5 intentos por defecto, `FLOW_WEBHOOK_MAX_ATTEMPTS`).

---

## Respuesta ampliada de conversación (para UI)

```json
{
  "id": "conv_xxx",
  "mode": "BOT",
  "activeFlowRun": {
    "id": "run_xxx",
    "status": "AWAITING_AGENT_INPUT",
    "flowName": "Cotización tablas personalizadas",
    "flowVersion": 3,
    "currentNodeId": "send-quote",
    "pendingAgentInput": {
      "template": "Hola {{customer.name}}, tu cotización es {{quote.total}} CLP...",
      "fields": [
        { "key": "quote.total", "label": "Total", "type": "number", "required": true, "value": null }
      ],
      "prefilled": { "customer.name": "Camila" }
    }
  },
  "flowModeLocked": true
}
```

`flowModeLocked: true` → deshabilitar en UI el switch a modo humano.

---

## Integración en pipeline de mensajes

```text
MessageRouterService.route()
  → ingest
  → FlowOrchestrator.handleInboundMessage()
       ├─ activeFlowRun → FlowEngine.processEvent()
       ├─ evaluar triggers publicados
       └─ else → ResponsePipelineService (FAQ/RAG/IA actual)
```

---

## Catálogo y pricing (caso tablas)

- **Lookup:** `TenantCatalogProduct` por SKU/categoría/metadata
- **Delivery:** `TenantDeliveryRegion` + comuna del slot `delivery.commune`
- **Pricing MVP:** `quantity × unitPrice + customization + delivery` (reglas en nodo `action`)
- **Salida:** nodo `emit_event` → JSON §15 spec + webhook firmado

---

## Supabase Storage

Ver [flows-supabase-storage.md](./flows-supabase-storage.md).

Variables de entorno backend (PR6):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_FLOW_FILES_BUCKET` (default: `flow-files`)

---

## Roadmap backend (PRs)

| PR | Contenido |
|----|-----------|
| PR1 ✅ | Schema + migración + este doc |
| PR2 ✅ | API CRUD flows/versions + simulate |
| PR3 ✅ | FlowEngine + hook MessageRouter + flow-runs API |
| PR4 ✅ | Cotización real con catálogo + delivery |
| PR5 ✅ | agent-input + reviews + loops archivo + delivery WA |
| PR6 ✅ | Supabase Storage + media WA inbound |
| PR7 ✅ | Triggers webhook/API + idempotencia HMAC |
| PR8 ✅ | Webhooks salientes firmados + reintentos BullMQ |

---

## Dependencias de deploy

1. `prisma migrate deploy` (tablas flujos)
2. Ejecutar SQL de bucket Storage en Supabase (PR6)
3. Variables `SUPABASE_*` en ECS/Secrets Manager
4. Redis y BullMQ ya existentes
5. UI: consumir endpoints, globo `pendingAgentInput`, inbox con `active_flow_run` / `flow_mode_locked`

---

## Cómo probar (backend)

1. Migrar DB: `npm run prisma:migrate`
2. Crear flujo + versión + publicar vía API (cuando PR2 esté listo)
3. `POST .../conversations/:id/flows/:flowId/start`
4. Enviar mensajes WA → ver avance en `GET .../flow-runs/:runId`
5. Simular `agent-input` y resolución de review
6. Verificar que `PATCH mode=HUMAN` devuelve 409 con run activo
7. Webhook saliente E2E: `npm run test:flow-webhook` (API en :3000 + DB migrada)
8. Trigger webhook con firma HMAC

---

## Archivos tocados (PR8)

| Ruta | Cambio |
|------|--------|
| `prisma/schema.prisma` | `FlowWebhookDelivery`, `FlowWebhookDeliveryAttempt`, `FLOW_WEBHOOK` |
| `prisma/migrations/20260729200000_flow_webhook_deliveries/` | Migración SQL |
| `src/modules/flows/flow-webhook-delivery.service.ts` | Programar, ejecutar y reintentar entregas |
| `src/modules/flows/flow-webhook-integration.service.ts` | Config tenant URL/secreto/eventos |
| `src/modules/flows/flow-webhook-outbound.utils.ts` | Firma HMAC saliente |
| `src/modules/queue/flow-webhook-delivery.*` | Cola + worker BullMQ |
| `src/modules/flows/flow-engine.service.ts` | Hook en nodo `emit_event` |
| `src/modules/api/flow-webhook-*.controller.ts` | API integración + deliveries |
| `src/workers.ts` | Arranca worker de webhooks salientes |

---

## Archivos tocados (PR7)

| Ruta | Cambio |
|------|--------|
| `src/modules/flows/flow-trigger-start.service.ts` | Inicio por API/webhook + conversación |
| `src/modules/flows/flow-webhook.utils.ts` | HMAC + secreto encriptado en trigger |
| `src/modules/flows/flow-webhook-signature.middleware.ts` | Valida `X-ConversAI-Signature` |
| `src/modules/api/flow-triggers.controller.ts` | Handlers HTTP |
| `src/app.ts` | Ruta pública `POST /webhooks/flows/:triggerId` |
| `src/modules/flows/flow-engine.service.ts` | `idempotencyKey` + `initialVariables` en `start()` |
| `src/modules/flows/flows.service.ts` | Persiste secreto webhook cifrado al sync triggers |

---

## Archivos tocados (PR5 + PR6)

| Ruta | Cambio |
|------|--------|
| `src/modules/flows/flow-delivery.service.ts` | Envío BOT por WA tras agent-input/review |
| `src/modules/flows/flow-file.service.ts` | Ingest media WA → Supabase → `FlowFile` |
| `src/modules/flows/infrastructure/flow-supabase-storage.service.ts` | Cliente Storage (upload + signed URL) |
| `src/modules/flows/flow-engine.service.ts` | Media, review loops (`maxAttempts`, `CHANGES_REQUESTED`) |
| `src/modules/flows/flow-orchestrator.service.ts` | Pasa `incomingMedia` + `accessToken` al motor |
| `src/modules/api/flow-runs.controller.ts` | Delivery en agent-input/resolve; reviews enriquecidas |
| `src/modules/api/flow-files.controller.ts` | `GET .../signed-url` |
| `src/modules/conversations/conversations-inbox.service.ts` | `active_flow_run`, `flow_mode_locked` en inbox |
| `src/modules/router/message-router.service.ts` | Media WA al orchestrator; `contentType` en ingest |
| `src/modules/channel/whatsapp.client.ts` | `getMediaMetadata`, `downloadMediaBuffer` |
| `src/config/env.ts` | `SUPABASE_*` opcionales |

---

## Archivos tocados (PR1)

| Ruta | Cambio |
|------|--------|
| `prisma/schema.prisma` | Modelos Flow* + `Conversation.activeFlowRunId` |
| `prisma/migrations/20260729180000_flows_module/` | Migración SQL |
| `docs/pending/flows-backend-mvp.md` | Este documento |
| `docs/pending/flows-supabase-storage.md` | Bucket y políticas Storage |
