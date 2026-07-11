# Estado y costos estimados de staging en AWS.
#
# Uso:
#   .\scripts\aws-staging-status.ps1

param(
  [string]$Region = "sa-east-1",
  [string]$ClusterName = "easycomp-staging",
  [string]$ServiceName = "chat-whatsapp-ai-combined"
)

$ErrorActionPreference = "Continue"

Write-Host "=== ECS staging ($Region) ===" -ForegroundColor Cyan

$svc = aws ecs describe-services `
  --cluster $ClusterName `
  --services $ServiceName `
  --region $Region `
  --query "services[0].{status:status,desired:desiredCount,running:runningCount,pending:pendingCount,taskDef:taskDefinition}" `
  --output json 2>$null | ConvertFrom-Json

if (-not $svc) {
  Write-Host "No se pudo leer el servicio. Revisa cluster/nombre y permisos ecs:DescribeServices." -ForegroundColor Red
  exit 1
}

$state = if ($svc.running -eq 0 -and $svc.desired -eq 0) { "APAGADO" }
         elseif ($svc.running -lt $svc.desired) { "ARRANCANDO" }
         else { "ENCENDIDO" }

Write-Host "Estado:     $state"
Write-Host "Desired:    $($svc.desired)"
Write-Host "Running:    $($svc.running)"
Write-Host "Pending:    $($svc.pending)"
Write-Host ""

Write-Host "=== Costos aproximados (sa-east-1, 24/7) ===" -ForegroundColor Cyan
Write-Host "Fargate (0.5 vCPU, 1 GB):  ~`$20-25/mes  [se ahorra al apagar ECS]"
Write-Host "ALB easycomp-api-staging:   ~`$16-25/mes  [siempre activo]"
Write-Host "Secrets + ECR:               ~`$1/mes"
Write-Host ""
Write-Host "Comandos:"
Write-Host "  Apagar:  .\scripts\aws-staging-stop.ps1"
Write-Host "  Encender: .\scripts\aws-staging-start.ps1"

if ($svc.running -gt 0) {
  Write-Host ""
  try {
    $health = curl.exe -s -m 10 https://api.conversai.easycomp.cl/health
    Write-Host "Health: $health"
  } catch {
    Write-Host "Health: no respondio (aun arrancando?)"
  }
}
