# EasyComp Bot IA

Backend conversacional multi-tenant para WhatsApp Cloud API. Implementa el motor de respuesta FAQ → RAG (pgvector) → IA → derivación humana, APIs internas para un portal futuro y procesamiento asíncrono con Redis.

## Stack

- Node.js + TypeScript + Express
- Prisma + PostgreSQL + pgvector
- OpenAI (chat + embeddings)
- BullMQ + Redis
- WhatsApp Cloud API

## Arquitectura

```txt
WhatsApp Cloud API → Webhook → Cola Redis → Worker
  → Tenant Resolver → Decision Engine
  → FAQ Engine → RAG Engine → AI Engine → Handoff
  → PostgreSQL + UsageEvents
```

## Módulos

- `src/modules/channel` — webhook WhatsApp y validación de firma Meta
- `src/modules/queue` — cola y worker BullMQ
- `src/modules/router` — enrutamiento de mensajes
- `src/modules/decision` — motor BOT/HUMAN
- `src/modules/faq` — respuestas por FAQ
- `src/modules/rag` — búsqueda semántica pgvector
- `src/modules/runtime` — pipeline de respuesta, handoff, prompts
- `src/modules/knowledge` — indexación de documentos
- `src/modules/api` — APIs internas REST
- `src/modules/metrics` — métricas y usage events

## Variables de entorno

Copia `.env.example` a `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatsapp_ai_saas
REDIS_URL=redis://localhost:6379
WHATSAPP_VERIFY_TOKEN=...
META_APP_SECRET=...
META_SYSTEM_USER_ACCESS_TOKEN=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ENCRYPTION_SECRET=... # mínimo 32 caracteres
INTERNAL_API_KEY=...
SKIP_WEBHOOK_SIGNATURE=true  # solo desarrollo local
```

## Instalación local

```bash
docker compose up -d
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```

## Alta de un negocio (sin portal)

```bash
# Crear negocio
curl -X POST http://localhost:3000/businesses \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Mi Negocio","slug":"mi-negocio","botName":"Asistente","botTone":"profesional"}'

# Vincular WhatsApp
curl -X POST http://localhost:3000/businesses/{id}/whatsapp-accounts \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number_id":"...","phone_number":"+56...","access_token":"..."}'

# Registrar agente
curl -X POST http://localhost:3000/businesses/{id}/agents \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Vendedor","phone":"+56...","is_primary":true}'
```

## APIs internas (SPEC §12)

Todas requieren header `X-API-Key`.

| Método | Ruta |
|--------|------|
| POST | `/businesses` |
| GET | `/businesses/:id` |
| PATCH | `/businesses/:id/settings` |
| POST | `/businesses/:id/whatsapp-accounts` |
| POST | `/businesses/:id/agents` |
| GET | `/businesses/:businessId/conversations` |
| GET | `/conversations/:id` |
| PATCH | `/conversations/:id/mode` |
| GET/POST/PATCH/DELETE | `/businesses/:businessId/faqs`, `/faqs/:id` |
| GET/POST/DELETE | `/businesses/:businessId/knowledge-documents` |
| POST | `/knowledge-documents/:id/index` |
| GET | `/businesses/:businessId/metrics/summary` |
| GET | `/businesses/:businessId/metrics/questions` |
| GET | `/businesses/:businessId/metrics/usage` |

## Motor de respuesta

1. **FAQ** — match exacto o semántico (umbral 0.92)
2. **RAG** — embeddings + pgvector, top 5 chunks
3. **IA** — GPT con contexto, respeta `confidence_threshold`
4. **Handoff** — deriva a humano y notifica agentes

## Tests

```bash
npm test
```

## Webhook WhatsApp

- `GET /webhooks/whatsapp` — verificación Meta
- `POST /webhooks/whatsapp` — recibe mensajes, encola y responde 200 OK inmediato
