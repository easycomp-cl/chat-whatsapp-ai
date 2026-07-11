# Deploy staging backend

Este backend queda listo para correr en cloud con una sola imagen Docker y dos comandos:

- API/webhook: `npm run start:api`
- Workers: `npm run start:workers`

Para ahorrar al inicio puedes correr solo un servicio combinado con `npm start`, pero para staging estable es mejor tener API y workers como servicios separados usando la misma imagen.

## 1. Supabase Postgres

En el proyecto Supabase staging:

1. Copia el connection string de Postgres.
2. Activa la extension `vector` / `pgvector`.
3. Usa esa URL como `DATABASE_URL` para el backend.
4. Ejecuta migraciones:

```bash
npm ci
npm run prisma:generate
npm run prisma:migrate
```

Despues ejecuta las migraciones SQL del proyecto UI (`supabase/migrations`) sobre la misma base para crear `profiles`, views, RLS y realtime.

## 2. Variables staging del backend

Configura estas variables en el servicio cloud:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_GRAPH_VERSION=v20.0
META_APP_SECRET=...
META_SYSTEM_USER_ACCESS_TOKEN=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ENCRYPTION_SECRET=...
INTERNAL_API_KEY=...
FAQ_SIMILARITY_THRESHOLD=0.80
STORAGE_PATH=/app/storage
SHOPIFY_API_VERSION=2024-10
SKIP_WEBHOOK_SIGNATURE=false
DEFAULT_TIMEZONE=America/Santiago
```

Notas:

- `INTERNAL_API_KEY` debe ser el mismo valor que `BOT_API_SECRET` en Vercel.
- `SKIP_WEBHOOK_SIGNATURE=false` en cloud.
- `ENCRYPTION_SECRET` debe tener al menos 32 caracteres y no cambiarse despues de guardar tokens cifrados.
- `REDIS_URL` puede ser Upstash/Redis compatible para ahorrar. Si usas AWS puro, usa ElastiCache/Valkey.

## 3. Servicios cloud

Usa la misma imagen Docker para dos servicios:

### API

Comando:

```bash
npm run start:api
```

Debe exponer HTTP en `PORT=3000`.

Health check:

```txt
/health
```

Dominio sugerido:

```txt
api-staging.tudominio.cl
```

### Workers

Comando:

```bash
npm run start:workers
```

No necesita exponer puerto publico.

## 4. Vercel UI

Configura en Vercel:

```env
BOT_API_BASE_URL=https://api-staging.tudominio.cl
BOT_API_SECRET=<mismo valor que INTERNAL_API_KEY>
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 5. WhatsApp Cloud API

Configura el webhook de Meta:

```txt
https://api-staging.tudominio.cl/webhooks/whatsapp
```

El verify token debe coincidir con `WHATSAPP_VERIFY_TOKEN`.

## 6. Checklist de prueba

1. `GET https://api-staging.tudominio.cl/health` responde `ok: true`.
2. Vercel puede llamar al backend con `BOT_API_SECRET`.
3. WhatsApp valida el webhook.
4. Un mensaje entrante se guarda en `Message`.
5. El worker procesa la cola.
6. El bot responde por WhatsApp.
7. La conversacion aparece en Supabase realtime/UI.
