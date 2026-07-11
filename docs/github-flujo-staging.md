# Flujo Git con GitHub → staging AWS

## Ramas

| Rama | Uso | Deploy automático |
|------|-----|-------------------|
| `main` | Código estable / futura producción | No (solo CI) |
| `staging` | Desarrollo del piloto | Sí → ECS `easycomp-staging` |

## Flujo diario

1. Trabaja en la rama `staging` (feature branches opcionales → PR a `staging`).
2. Al hacer **push a `staging`**, GitHub Actions:
   - **CI** (`ci.yml`): build + tests en cada push/PR.
   - **Deploy** (`deploy-staging.yml`): solo si cambian `src/`, `prisma/`, `Dockerfile`, etc.
     - Build imagen Docker → ECR `chat-whatsapp-ai:latest`
     - `force-new-deployment` en ECS `chat-whatsapp-ai-combined`
     - Health check en `https://api.conversai.easycomp.cl/health`
3. Cuando termines de probar en la semana: `.\scripts\aws-staging-stop.ps1` (apaga Fargate; el ALB sigue).
4. **Opcional — apagado automático 23:59 (Chile):** `.\scripts\setup-aws-nightly-stop.ps1` (~USD 0/mes).

## Apagado automático nocturno (opcional)

### Opción A — AWS (recomendada, ~USD 0/mes, no depende del PC)

```powershell
.\scripts\setup-aws-nightly-stop.ps1
```

Requiere permisos `lambda` + `scheduler` en el usuario IAM. Si falla, adjunta en consola IAM la política `infra/ecs-nightly-stop/iam-user-policy-scheduler.json` al usuario `easycomp-deploy` y vuelve a ejecutar.

### Opción B — Windows (USD 0, PC encendido a las 23:59)

```powershell
.\scripts\setup-windows-nightly-stop.ps1
```

| Qué | Detalle |
|-----|---------|
| Hora | 23:59 (Chile en AWS; hora local en Windows) |
| Acción | `desired-count = 0` en ECS |
| Costo del schedule | USD 0 |
| Ahorro Fargate | ~USD 0.03/h apagado (~USD 7/mes si apagas 8h/día) |
| No apaga | ALB (~USD 16/mes), Supabase, Upstash |

Para encender al día siguiente: `.\scripts\aws-staging-start.ps1` (o push a `staging` con deploy).

Quitar: `.\scripts\remove-aws-nightly-stop.ps1` o `.\scripts\remove-windows-nightly-stop.ps1`

## Qué NO va por GitHub (manual)

- **Secrets / `.env.production`** → `.\scripts\push-env-to-secrets-manager.ps1`
- **Vincular WhatsApp** → `.\scripts\link-whatsapp-staging.ps1`
- **Infra nueva** (VPC, ALB, primer deploy) → `.\infra\deploy-ecs-staging.ps1`
- **Migraciones Supabase** → aplicar en Supabase o `prisma migrate deploy` con `DATABASE_URL`

## Configurar GitHub (una vez)

### 1. Crear repo y subir ramas

```powershell
git remote add origin https://github.com/TU_ORG/chat-whatsapp-ai.git
git push -u origin main
git push -u origin staging
```

### 2. Secrets en GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Valor |
|--------|--------|
| `AWS_ACCESS_KEY_ID` | Usuario IAM (ej. `easycomp-deploy` o uno solo para CI) |
| `AWS_SECRET_ACCESS_KEY` | Secret del usuario |

### 3. Permisos IAM mínimos para CI/CD

El usuario de GitHub necesita al menos:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "arn:aws:ecs:sa-east-1:024848463506:service/easycomp-staging/chat-whatsapp-ai-combined"
    }
  ]
}
```

`ecr:GetAuthorizationToken` requiere `"Resource": "*"`.

### 4. Deploy manual desde GitHub

Actions → **Deploy staging (AWS ECS)** → **Run workflow** (rama `staging`).

## Notas

- Si ECS está apagado (`desired-count = 0`), un **push a staging con cambios de app** lo vuelve a encender (`desired-count = 1`) y despliega.
- Para apagar sin deploy: `.\scripts\aws-staging-stop.ps1`
- Cambios solo en `docs/` o `scripts/*.ps1` no disparan deploy; usa **Run workflow** si necesitas redeploy igual.
