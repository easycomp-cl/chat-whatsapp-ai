# Elimina el apagado automatico diario de ECS staging.
# Uso: .\scripts\remove-aws-nightly-stop.ps1

param(
  [string]$Region = "sa-east-1",
  [string]$FunctionName = "easycomp-staging-ecs-nightly-stop",
  [string]$ScheduleName = "easycomp-staging-ecs-stop-2359",
  [string]$RoleName = "easycomp-staging-ecs-scheduler-lambda",
  [string]$SchedulerRoleName = "easycomp-staging-eventbridge-scheduler",
  [switch]$KeepLambda
)

$ErrorActionPreference = "Stop"

Write-Host "Eliminando apagado automatico ECS..." -ForegroundColor Yellow

aws scheduler delete-schedule --name $ScheduleName --region $Region 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Schedule $ScheduleName eliminado."
} else {
  Write-Host "Schedule $ScheduleName no existia o ya fue eliminado."
}

if (-not $KeepLambda) {
  aws lambda delete-function --function-name $FunctionName --region $Region 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Lambda $FunctionName eliminada."
  }
}

Write-Host ""
Write-Host "OK. El schedule ya no apagara ECS automaticamente." -ForegroundColor Green
Write-Host "Roles IAM ($RoleName, $SchedulerRoleName) se dejaron por si reactivas el schedule."
Write-Host "Para borrar roles manualmente: consola IAM > Roles."
