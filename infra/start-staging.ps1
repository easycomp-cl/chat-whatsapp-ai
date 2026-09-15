# Enciende staging: recrea ALB si falta, despliega y escala ECS a 1 tarea.
#
# Uso:
#   .\infra\start-staging.ps1
#   .\infra\start-staging.ps1 -SkipDeploy   # solo escala ECS (ALB ya debe existir)

param(
  [string]$Region = "sa-east-1",
  [string]$ClusterName = "easycomp-staging",
  [string]$ServiceName = "chat-whatsapp-ai-combined",
  [string]$AlbName = "easycomp-api-staging",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Require-Ok([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "Fallo: $Step" }
}

Write-Host "=== Encendiendo staging ===" -ForegroundColor Cyan

if (-not $SkipDeploy) {
  Write-Host "1/3 Despliegue (ALB + task definition)"
  & "$root\infra\deploy-ecs-staging.ps1" -Region $Region -ClusterName $ClusterName -ServiceName $ServiceName -SkipIam
  if ($LASTEXITCODE -ne 0) { throw "Fallo: deploy-ecs-staging.ps1" }
} else {
  Write-Host "1/3 Despliegue omitido (-SkipDeploy)"
}

Write-Host "2/3 ECS -> desiredCount=1"
aws ecs update-service `
  --cluster $ClusterName `
  --service $ServiceName `
  --desired-count 1 `
  --region $Region | Out-Null
Require-Ok "ecs update-service"

Write-Host "3/3 Esperando tarea healthy (hasta 3 min)"
$deadline = (Get-Date).AddMinutes(3)
do {
  $running = aws ecs describe-services `
    --cluster $ClusterName `
    --services $ServiceName `
    --region $Region `
    --query "services[0].runningCount" `
    --output text
  Require-Ok "ecs describe-services"
  if ([int]$running -ge 1) { break }
  Write-Host "  Esperando arranque..."
  Start-Sleep -Seconds 15
} while ((Get-Date) -lt $deadline)

$albDns = aws elbv2 describe-load-balancers `
  --region $Region `
  --names $AlbName `
  --query "LoadBalancers[0].DNSName" `
  --output text 2>$null

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "STAGING ENCENDIDO"
Write-Host "========================================"
Write-Host "ECS: $running tarea(s) corriendo"

if ($albDns -and $albDns -ne "None") {
  Write-Host "Health: curl http://$albDns/health"
  Write-Host ""
  Write-Host "Si usas DNS propio, actualiza el CNAME al nuevo ALB:"
  Write-Host "  $albDns"
} else {
  Write-Warning "ALB no encontrado. Ejecuta sin -SkipDeploy."
}

Write-Host ""
Write-Host "Para apagar: .\infra\stop-staging.ps1"
