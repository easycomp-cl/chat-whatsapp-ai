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
