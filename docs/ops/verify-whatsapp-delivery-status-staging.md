# Verificación staging/prod — ticks WhatsApp (SENT → DELIVERED → READ)

> **API:** `https://api.conversai.easycomp.cl`  
> **Webhook Meta:** `https://api.conversai.easycomp.cl/webhooks/whatsapp`  
> **Script automático:** `scripts/verify-whatsapp-delivery-status.ts`

---

## Resumen

Si la UI solo muestra **✓ gris (SENT)**, el backend puede estar bien pero el **worker no procesa** los webhooks `statuses`, o la **migración** no está en la BD que lee Supabase.

---

## Checklist rápido (5 min)

| # | Verificación | Cómo | OK si… |
|---|--------------|------|--------|
| 1 | Migración enum | Script o SQL abajo | Existen `DELIVERED` y `READ` |
| 2 | Worker + Redis | ECS + logs | Jobs `status:*` completan |
| 3 | Webhook Meta | Developers → WhatsApp → Configuration | URL verificada, campo `messages` |
| 4 | Mensaje real | Enviar desde dashboard + abrir WA en celular | BD pasa a `DELIVERED` / `READ` |
| 5 | Realtime UI | Sin F5 | Ticks actualizan solos |

---

## 1. Script local (recomendado)

Desde este repo, con `.env.production` apuntando a la **misma BD** que staging/prod:

```powershell
cd chat-whatsapp-ai

# Solo diagnóstico BD (enum + últimos mensajes salientes)
npx tsx scripts/verify-whatsapp-delivery-status.ts

# Simular webhook Meta "delivered" (necesita WAMID real de un mensaje OUTBOUND)
npx tsx scripts/verify-whatsapp-delivery-status.ts `
  --simulate "wamid.HBg...." `
  --status delivered `
  --recipient "56912345678"

# Simular "read"
npx tsx scripts/verify-whatsapp-delivery-status.ts `
  --simulate "wamid.HBg...." `
  --status read `
  --recipient "56912345678"
```

**Salida esperada (simulación OK):**

```json
{
  "simulation": {
    "webhook": { "httpStatus": 200 },
    "after": { "ok": true, "message": { "whatsappDeliveryStatus": "DELIVERED" } },
    "workerLikelyOk": true
  }
}
```

Si `webhook.httpStatus === 200` pero `workerLikelyOk === false` → **worker/Redis**, no el webhook HTTP.

---

## 2. SQL en Supabase / Postgres

### Enum completo

```sql
SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'WhatsappDeliveryStatus'
ORDER BY e.enumsortorder;
```

Debe incluir: `PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED`.

Si faltan `DELIVERED`/`READ`:

```sql
-- prisma/migrations/20260728180000_whatsapp_delivery_delivered_read/migration.sql
ALTER TYPE "WhatsappDeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "WhatsappDeliveryStatus" ADD VALUE IF NOT EXISTS 'READ';
```

### Últimos salientes y su estado

```sql
SELECT
  id,
  LEFT("contentText", 40) AS preview,
  "externalId",
  "whatsappDeliveryStatus",
  "whatsappDeliveryErrorMessage",
  "createdAt"
FROM "Message"
WHERE direction = 'OUTBOUND'
  AND "externalId" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 15;
```

### Conteo por estado (últimos 7 días)

```sql
SELECT "whatsappDeliveryStatus", COUNT(*) AS n
FROM "Message"
WHERE direction = 'OUTBOUND'
  AND "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY n DESC;
```

Si **nunca** aparece `DELIVERED`/`READ` con tráfico real → worker o webhooks Meta.

---

## 3. Worker ECS + Redis

El webhook **solo encola**; el worker aplica el `UPDATE`.

| Variable ECS | Requerido |
|--------------|-----------|
| `REDIS_URL` | Sí (ElastiCache / Redis) |
| `DATABASE_URL` | Misma BD que la UI |

**Logs CloudWatch** (servicio `chat-whatsapp-ai-combined`):

- Buscar: `Message worker job completed` con `jobId` tipo `status-wamid...-delivered-...`
- Si ves `Webhook enqueue error` con **`Custom Id cannot contain :`**: bug corregido en `message.queue.ts` (jobId de statuses no puede llevar `:` en BullMQ). **Redeploy backend.**
- Error: `Message worker job failed` o `Outbound delivery status webhook without matching message`

**Causa frecuente:** Redis caído → mensajes de chat llegan por otra ruta pero **statuses no se persisten**.

---

## 4. Meta Developers

1. [developers.facebook.com](https://developers.facebook.com) → tu app → **WhatsApp** → **Configuration**.
2. **Callback URL:** `https://api.conversai.easycomp.cl/webhooks/whatsapp`
3. **Verify token:** igual que `WHATSAPP_VERIFY_TOKEN` en Secrets Manager.
4. **Webhook fields:** suscrito a **messages** (incluye statuses).
5. WABA → **suscrito a la app** (`subscribed_apps`).

Prueba manual desde Meta (Test webhook) con payload `statuses` y un `wamid` real.

---

## 5. Prueba E2E humana (la definitiva)

1. Dashboard → modo humano → enviar texto a un cliente de prueba.
2. En Supabase, copiar `externalId` (wamid) del mensaje → estado inicial `SENT`.
3. En el **celular del cliente**: recibir notificación y **abrir el chat** (no solo bandeja).
4. Refrescar SQL: debe pasar `DELIVERED` y luego `READ` (si el cliente tiene lecturas activadas).
5. En UI: ✓✓ gris → ✓✓ azul **sin recargar** (Realtime).

**Nota:** Si el cliente desactivó “lecturas” en WhatsApp, puede quedarse en `DELIVERED` forever — es normal.

---

## 6. Contrato para el front

Ver [`docs/to-front/whatsapp-delivery-status-ui.md`](../to-front/whatsapp-delivery-status-ui.md).

Campo clave: `whatsapp_delivery_status` en vista `messages` o API.

---

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| Siempre `SENT` | Worker no corre | ECS desired count, Redis, logs worker |
| Webhook 401 | Firma Meta | `META_APP_SECRET` en Secrets Manager |
| Webhook 200, BD no cambia | Cola no consume | Redis URL, worker crash loop |
| `not_found` en logs | `externalId` no coincide | Mensaje creado sin wamid o otro entorno |
| SQL OK, UI no actualiza | Realtime / vista | `messages` expone `whatsapp_delivery_status`; hook UPDATE |
| Solo `DELIVERED`, nunca `READ` | Cliente sin lecturas | Probar con otro número |

---

## Migraciones relacionadas

| Migración | Qué hace |
|-----------|----------|
| `20260728180000_whatsapp_delivery_delivered_read` | Enum `DELIVERED`, `READ` |
| `20260731180000_whatsapp_delivery_error` | Detalle en `FAILED` |

Se aplican con `prisma migrate deploy` al arrancar el contenedor (`npm run start:prod`).
