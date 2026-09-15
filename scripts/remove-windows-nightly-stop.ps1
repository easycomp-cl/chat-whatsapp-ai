# Elimina la tarea programada de apagado ECS en Windows.
param(
  [string]$TaskName = "EasyComp-Staging-ECS-Stop"
)

$ErrorActionPreference = "Stop"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Tarea '$TaskName' eliminada (si existia)." -ForegroundColor Green
