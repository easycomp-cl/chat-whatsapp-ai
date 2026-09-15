# Apaga staging para ahorrar costos: escala ECS a 0 y elimina el ALB.
# El target group se conserva (sin costo) para facilitar el arranque.
#
# Uso:
#   .\infra\stop-staging.ps1
#   .\infra\stop-staging.ps1 -KeepAlb   # solo apaga ECS, mantiene ALB (~$12-16 USD/mes)

param(
  [string]$Region = "sa-east-1",
  [string]$ClusterName = "easycomp-staging",
  [string]$ServiceName = "chat-whatsapp-ai-combined",
  [string]$AlbName = "easycomp-api-staging",
  [switch]$KeepAlb
)

$ErrorActionPreference = "Stop"

function Require-Ok([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "Fallo: $Step" }
}

Write-Host "=== Apagando staging ===" -ForegroundColor Cyan

Write-Host "1/2 ECS -> desiredCount=0"
aws ecs update-service `
  --cluster $ClusterName `
  --service $ServiceName `
  --desired-count 0 `
  --region $Region | Out-Null
Require-Ok "ecs update-service"

$deadline = (Get-Date).AddMinutes(5)
do {
  $running = aws ecs describe-services `
    --cluster $ClusterName `
    --services $ServiceName `
    --region $Region `
    --query "services[0].runningCount" `
    --output text
  Require-Ok "ecs describe-services"
  if ([int]$running -eq 0) { break }
  Write-Host "  Esperando que terminen tareas... ($running corriendo)"
  Start-Sleep -Seconds 10
} while ((Get-Date) -lt $deadline)

if ([int]$running -gt 0) {
  Write-Warning "Quedan $running tarea(s) corriendo; se eliminara el ALB de todos modos."
}

if ($KeepAlb) {
  Write-Host "2/2 ALB conservado (-KeepAlb)"
} else {
  Write-Host "2/2 Eliminando ALB ($AlbName)"
  $albArn = aws elbv2 describe-load-balancers `
    --region $Region `
    --names $AlbName `
    --query "LoadBalancers[0].LoadBalancerArn" `
    --output text 2>$null

  if ($albArn -and $albArn -ne "None") {
    $listeners = aws elbv2 describe-listeners `
      --load-balancer-arn $albArn `
      --region $Region `
      --query "Listeners[*].ListenerArn" `
      --output text
    Require-Ok "describe-listeners"

    foreach ($listenerArn in (($listeners -split "\s+") | Where-Object { $_ })) {
      aws elbv2 delete-listener --listener-arn $listenerArn --region $Region | Out-Null
      Require-Ok "delete-listener"
    }

    aws elbv2 delete-load-balancer --load-balancer-arn $albArn --region $Region | Out-Null
    Require-Ok "delete-load-balancer"
    Write-Host "  ALB eliminado"
  } else {
    Write-Host "  ALB no existe (ya apagado)"
  }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "STAGING APAGADO"
Write-Host "========================================"
Write-Host "ECS: 0 tareas"
if ($KeepAlb) {
  Write-Host "ALB: activo (sigue generando costo)"
} else {
  Write-Host "ALB: eliminado (~\$12-16 USD/mes ahorrados)"
}
Write-Host ""
Write-Host "Para volver a probar: .\infra\start-staging.ps1"
