# Deploy producción — checklist release backend

> **Fecha:** 2026-07-29  
> **Dominio API:** `https://api.conversai.easycomp.cl`  
> **Mecanismo:** push a rama `staging` → GitHub Action `Deploy staging (AWS ECS)`  
> **Cluster/servicio:** `easycomp-staging` / `chat-whatsapp-ai-combined`  
> **Migraciones:** `CMD` de Docker ejecuta `npm run start:prod` → `prisma migrate deploy`

## Qué incluye este release

| Feature | Estado código | Migración |
|---------|---------------|-----------|
| Inbox optimizado | ✅ | `20260713010000_inbox_performance` |
| Delivery `DELIVERED` / `READ` | ✅ | `20260728180000_whatsapp_delivery_delivered_read` |
| Errores delivery `FAILED` (detalle Meta) | ✅ | `20260731180000_whatsapp_delivery_error` |
| Edit/revoke mensajes del cliente | ✅ | `20260728140000_customer_message_changes` |
| `PATCH /messages/:id` edición saliente | ✅ cerrado → **501** | — |
| Perfil CRM contacto | ✅ | `20260728220000_customer_profile_team_roles` |
| Rol `collaborator` en agents | ✅ | misma migración |

## Pasos

1. **Commit + push** a `staging` (dispara build ECR + force-new-deployment ECS).
2. Esperar Action verde + health `GET /health`.
3. Verificar endpoints abajo (migraciones se aplican al arrancar el contenedor).
4. No tocar `BOT_API_BASE_URL` / `BOT_API_SECRET` en Vercel.
5. **Ticks WhatsApp:** `npm run verify:delivery-status` — ver [`docs/ops/verify-whatsapp-delivery-status-staging.md`](./ops/verify-whatsapp-delivery-status-staging.md).

## Verificación post-deploy

PowerShell (usa `.env.production` local; no pegues secretos en chat):

```powershell
$envFile = Get-Content .env.production | Where-Object { $_ -match '=' -and $_ -notmatch '^\s*#' }
$map = @{}
foreach ($line in $envFile) {
  $k, $v = $line -split '=', 2
  $map[$k.Trim()] = $v.Trim()
}
$BASE = "https://api.conversai.easycomp.cl"
$KEY = $map["INTERNAL_API_KEY"]
$BIZ = $map["TENANT_ID"]

# Health
Invoke-RestMethod "$BASE/health"

# Inbox (debe ser 200, no 404)
Invoke-RestMethod -Headers @{ "X-API-Key" = $KEY } "$BASE/businesses/$BIZ/conversations/inbox?limit=2"

# Customer profile (si hay customerId real)
# Invoke-RestMethod -Headers @{ "X-API-Key" = $KEY } "$BASE/businesses/$BIZ/customers/<CUSTOMER_ID>"

# Edit saliente — esperado 501
try {
  Invoke-WebRequest -Method PATCH -Headers @{ "X-API-Key" = $KEY; "Content-Type" = "application/json" } `
    -Body '{"text":"x"}' -Uri "$BASE/messages/fake-id" -UseBasicParsing
} catch { $_.Exception.Response.StatusCode.value__ }
```

| Prueba | Esperado |
|--------|----------|
| `/health` | `ok: true` |
| Inbox | `200` + `conversations[]` con `last_message_preview` |
| `GET .../customers/:id` | `200` con `display_alias`, `is_returning`, etc. |
| `PATCH /messages/:id` | `501` (Meta no soporta) |

## Rollback rápido

```powershell
# Bajar desired count / redeploy imagen anterior (SHA previo en ECR)
aws ecs update-service --cluster easycomp-staging --service chat-whatsapp-ai-combined --force-new-deployment --region sa-east-1
```

## Notas UI

- Inbox: al responder 200, la UI deja el fallback Supabase automáticamente.
- Perfil CRM / alias: la UI aún debe consumir `GET/PATCH .../customers/:id` (spec en `docs/done/backend-customer-profile-crm.md`).
- Enum login `COLLABORATOR` en `profiles` es migración del repo UI (Supabase), no de este backend.
