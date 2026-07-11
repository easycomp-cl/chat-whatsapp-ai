# Apaga staging en AWS (ECS desired-count = 0).
# Ahorra ~$20-25/mes de Fargate. El ALB (~$16/mes) sigue activo.
#
# Uso:
#   .\scripts\aws-staging-stop.ps1
#
# Requiere AWS CLI con permiso ecs:UpdateService en el servicio.

param(
  [string]$Region = "sa-east-1",
  [string]$ClusterName = "easycomp-staging",
  [string]$ServiceName = "chat-whatsapp-ai-combined"
)

$ErrorActionPreference = "Stop"

Write-Host "Deteniendo $ServiceName en $ClusterName ($Region)..." -ForegroundColor Yellow

$result = aws ecs update-service `
  --cluster $ClusterName `
  --service $ServiceName `
  --desired-count 0 `
  --region $Region `
  --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) { throw "Fallo al actualizar el servicio ECS" }

Write-Host "OK. desired-count = $($result.service.desiredCount)" -ForegroundColor Green
Write-Host ""
Write-Host "Efecto:" -ForegroundColor Cyan
Write-Host "  - API y workers OFF (sin costo Fargate)"
Write-Host "  - Webhook Meta devolvera error / timeout hasta que enciendas de nuevo"
Write-Host "  - Redis Upstash deja de consumir comandos por los workers"
Write-Host "  - ALB sigue cobrando (~`$16/mes) — no se puede apagar sin borrar el load balancer"
Write-Host ""
Write-Host "Para encender: .\scripts\aws-staging-start.ps1"
