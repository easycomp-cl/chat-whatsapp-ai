# Enciende staging en AWS (ECS desired-count = 1 + redeploy).
#
# Uso:
#   .\scripts\aws-staging-start.ps1
#
# Tras ~2-3 min verifica: curl https://api.conversai.easycomp.cl/health

param(
  [string]$Region = "sa-east-1",
  [string]$ClusterName = "easycomp-staging",
  [string]$ServiceName = "chat-whatsapp-ai-combined",
  [switch]$SkipRedeploy
)

$ErrorActionPreference = "Stop"

Write-Host "Iniciando $ServiceName en $ClusterName ($Region)..." -ForegroundColor Yellow

$args = @(
  "ecs", "update-service",
  "--cluster", $ClusterName,
  "--service", $ServiceName,
  "--desired-count", "1",
  "--region", $Region,
  "--output", "json"
)
if (-not $SkipRedeploy) {
  $args += "--force-new-deployment"
}

$result = aws @args | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) { throw "Fallo al actualizar el servicio ECS" }

Write-Host "OK. desired-count = $($result.service.desiredCount)" -ForegroundColor Green
Write-Host ""
Write-Host "Espera 2-3 min y prueba:" -ForegroundColor Cyan
Write-Host "  curl https://api.conversai.easycomp.cl/health"
Write-Host ""
Write-Host "Para apagar cuando termines: .\scripts\aws-staging-stop.ps1"
