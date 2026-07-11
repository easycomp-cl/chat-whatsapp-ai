# SPEC Cursor: Migracion Backend Staging a Supabase + API/Bot Cloud

## Objetivo

Dejar funcional el backend `chat-whatsapp-ai` en ambiente staging conectado a Supabase, con la UI ya desplegada en Vercel, para probar el flujo completo en nube:

1. UI Vercel staging.
2. Supabase como base unica: Postgres, Auth, RLS, Realtime y pgvector.
3. Backend API/bot conectado a Supabase.
4. Webhook WhatsApp apuntando al backend staging.
5. Workers procesando mensajes, conocimiento e importaciones.

## Contexto Actual

Repositorio backend:

```txt
C:\Users\ISRAEL\Desktop\EasyComp\Projects\chat-whatsapp-ai
```

Repositorio UI:

```txt
C:\Users\ISRAEL\Desktop\EasyComp\Projects\chat-whatsapp-ai-ui
```

La UI ya fue migrada/desplegada en Vercel.

El proyecto Supabase ya fue creado.

La extension `pgvector` ya fue activada correctamente en Supabase:

```txt
extname: vector
extversion: 0.8.0
```

El backend ya tiene:

- Prisma schema en `prisma/schema.prisma`.
- Migraciones Prisma en `prisma/migrations`.
- API Express en `src/app.ts`.
- Entrada combinada API + workers en `src/server.ts`.
- Entrada API-only en `src/api.ts`.
- Entrada workers-only en `src/workers.ts`.
- Dockerfile en `Dockerfile`.
- Guia base en `docs/deploy-staging-backend.md`.

## Restricciones

- No usar datos productivos reales todavia.
- Trabajar primero solo con staging para ahorrar costos.
- No exponer secretos en frontend ni commits.
- `INTERNAL_API_KEY` del backend debe ser igual a `BOT_API_SECRET` en Vercel.
- `SUPABASE_SERVICE_ROLE_KEY` solo puede usarse server-side.
- `SKIP_WEBHOOK_SIGNATURE` debe estar en `false` para cloud.
- `ENCRYPTION_SECRET` debe tener minimo 32 caracteres y mantenerse estable una vez guardados tokens cifrados.

## Arquitectura Staging Deseada

```txt
Vercel UI
  -> Supabase Auth/RLS/Realtime
  -> Backend API staging mediante BOT_API_BASE_URL + BOT_API_SECRET

WhatsApp Cloud API
  -> Backend API staging /webhooks/whatsapp
  -> Cola Redis/BullMQ
  -> Workers
  -> Supabase Postgres + pgvector
  -> OpenAI
  -> WhatsApp Cloud API respuesta
```

## Variables Requeridas

### Backend

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<supabase-postgres-connection-string>
REDIS_URL=<redis-compatible-url>
WHATSAPP_VERIFY_TOKEN=<token-definido-por-nosotros>
WHATSAPP_GRAPH_VERSION=v20.0
META_APP_SECRET=<meta-app-secret>
META_SYSTEM_USER_ACCESS_TOKEN=<meta-system-user-token>
OPENAI_API_KEY=<openai-api-key>
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ENCRYPTION_SECRET=<minimo-32-caracteres>
INTERNAL_API_KEY=<secreto-compartido-con-vercel>
FAQ_SIMILARITY_THRESHOLD=0.80
STORAGE_PATH=/app/storage
SHOPIFY_API_VERSION=2024-10
SKIP_WEBHOOK_SIGNATURE=false
DEFAULT_TIMEZONE=America/Santiago
```

### Vercel UI

```env
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
BOT_API_BASE_URL=https://api-staging.<dominio>
BOT_API_SECRET=<mismo-valor-que-INTERNAL_API_KEY>
```

## Tareas

### 1. Preparar Conexion Supabase

1. Confirmar que Supabase tiene `vector` activo:

```sql
select extname, extversion
from pg_extension
where extname = 'vector';
```

Resultado esperado:

```txt
vector | 0.8.0
```

2. Configurar `DATABASE_URL` del backend usando el connection string de Supabase.

Notas:

- Usar connection string directo para migraciones.
- Si se usa pooler para runtime, validar compatibilidad con Prisma.
- No commitear `DATABASE_URL`.

### 2. Ejecutar Migraciones Prisma Backend

Desde el repo backend:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

Resultado esperado:

- Tablas Prisma creadas en Supabase:
  - `Tenant`
  - `TenantChannel`
  - `TenantConfig`
  - `TenantFaq`
  - `TenantDocument`
  - `KnowledgeChunk`
  - `Customer`
  - `Conversation`
  - `Message`
  - `MessageReaction`
  - `UsageEvent`
  - `TenantAdmin`
  - `ChatImportJob`
  - `ImportedChatMessage`
  - `DetectedFaqSuggestion`
  - `ToneAnalysisResult`

Validacion SQL:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

### 3. Ejecutar Migraciones Supabase UI

Desde el repo UI, aplicar los SQL de:

```txt
supabase/migrations
```

Orden esperado:

```txt
20260608100000_dashboard_init.sql
20260608200000_realtime_messages.sql
20260609100000_messages_reactions_replies.sql
20260629100000_conversation_chat_cleared.sql
```

Estas migraciones deben crear:

- `profiles`
- `conversation_notes`
- views:
  - `businesses`
  - `whatsapp_accounts`
  - `customers`
  - `conversations`
  - `messages`
  - `faqs`
  - `knowledge_documents`
  - `business_agents`
  - `usage_events`
- RLS policies.
- Realtime para `Message` y `Conversation`.

Validaciones SQL:

```sql
select * from public.profiles limit 1;
select * from public.businesses limit 1;
select * from public.conversations limit 1;
select * from public.messages limit 1;
```

### 4. Sembrar Datos Iniciales

Crear al menos:

1. Un tenant/negocio.
2. Configuracion del tenant.
3. Canal WhatsApp.
4. Admin/agente.
5. Perfil Supabase asociado al usuario admin.

Opciones:

- Usar endpoints internos del backend.
- Usar seed Prisma si esta alineado con staging.
- Insertar manualmente solo si se entiende el modelo.

Endpoints backend utiles:

```txt
POST /businesses
GET /businesses
PATCH /businesses/:id/settings
POST /businesses/:id/whatsapp-accounts
POST /businesses/:id/agents
```

Todos requieren:

```txt
X-API-Key: <INTERNAL_API_KEY>
```

### 5. Redis/BullMQ Staging

El backend actual usa BullMQ:

```txt
src/modules/queue/*
src/lib/redis.ts
```

Para staging barato:

- Usar Upstash Redis o Redis Cloud compatible.
- Configurar `REDIS_URL`.

Resultado esperado:

- `message.worker` puede consumir cola `whatsapp-messages`.
- `knowledge-index.worker` puede consumir cola de indexacion.
- `chat-import-analysis.worker` puede consumir cola de analisis.

### 6. Desplegar Backend

El repo ya tiene `Dockerfile`.

Comandos disponibles:

```bash
npm start
npm run start:api
npm run start:workers
```

Para ahorrar al inicio:

- Desplegar un solo servicio con:

```bash
npm start
```

Esto levanta API + workers desde `src/server.ts`.

Para staging mas ordenado:

- Servicio API:

```bash
npm run start:api
```

- Servicio workers:

```bash
npm run start:workers
```

Health check:

```txt
GET /health
```

Respuesta esperada:

```json
{ "ok": true, "db": "up" }
```

### 7. Conectar UI Vercel al Backend

En Vercel:

```env
BOT_API_BASE_URL=https://api-staging.<dominio>
BOT_API_SECRET=<INTERNAL_API_KEY>
```

Validar desde UI:

- Dashboard carga negocios/conversaciones.
- Acciones server-side pueden llamar al backend.
- No aparece error `Unauthorized`.
- No aparece error `BOT_API_BASE_URL is not configured`.

### 8. Configurar WhatsApp Cloud API

En Meta Developer:

Webhook callback:

```txt
https://api-staging.<dominio>/webhooks/whatsapp
```

Verify token:

```txt
WHATSAPP_VERIFY_TOKEN
```

Suscribir eventos:

```txt
messages
```

Validar:

1. Meta acepta la verificacion webhook.
2. `GET /webhooks/whatsapp` responde challenge.
3. `POST /webhooks/whatsapp` recibe mensajes.
4. Worker procesa evento.
5. `Message` se guarda en Supabase.
6. Bot responde por WhatsApp.

## Checklist E2E

### API

```txt
GET https://api-staging.<dominio>/health
```

Debe responder:

```json
{ "ok": true, "db": "up" }
```

### UI

1. Login en `https://staging.<dominio>`.
2. Usuario tiene perfil activo.
3. Perfil tiene `business_id`.
4. Dashboard carga sin errores.

### WhatsApp

1. Enviar mensaje al numero de prueba.
2. Confirmar que aparece en `Message`.
3. Confirmar que aparece en UI realtime.
4. Confirmar que bot responde.
5. Probar cambio de modo `BOT` a `HUMAN`.
6. Probar respuesta humana desde UI.

### RAG

1. Crear documento de conocimiento.
2. Indexarlo.
3. Confirmar chunks en `KnowledgeChunk`.
4. Enviar pregunta relacionada.
5. Confirmar respuesta con IA/RAG.

## Riesgos Conocidos

### Storage local

`src/modules/storage/storage.service.ts` usa filesystem local.

Para staging inicial puede funcionar si el servicio tiene disco persistente, pero para cloud escalable se debe migrar a:

- S3, recomendado para AWS.
- Supabase Storage, si se quiere simplificar.

### API + workers juntos

Para ahorrar se puede usar `npm start`, pero al escalar conviene separar:

- API/webhook.
- Workers.

### Orden de mensajes

BullMQ actual procesa con concurrencia. Si llegan mensajes rapidos de la misma conversacion, podrian procesarse fuera de orden.

Mitigacion futura:

- Lock por `tenantId + phone`.
- O migrar cola critica a SQS FIFO.

### Tests locales

El build TypeScript pasa con:

```bash
.\node_modules\.bin\tsc.cmd -p tsconfig.json
```

Un test falla por fixture externo faltante:

```txt
C:\Users\ISRAEL\Desktop\EasyComp\Projects\chat-whatsapp-ai-ui\data\Caro Barquín.txt
```

No bloquear deploy por ese test si el fixture no existe en CI.

## Definition of Done

Se considera completado cuando:

1. Supabase tiene tablas Prisma + views/RLS UI.
2. `GET /health` del backend cloud responde OK.
3. Vercel UI puede autenticarse con Supabase.
4. Vercel UI puede llamar al backend usando `BOT_API_SECRET`.
5. Meta valida webhook staging.
6. Un mensaje WhatsApp entrante:
   - llega al backend,
   - se encola,
   - se procesa,
   - se guarda en Supabase,
   - aparece en UI,
   - recibe respuesta del bot.
7. Se puede responder manualmente desde la UI.
