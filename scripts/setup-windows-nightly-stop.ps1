# Programa apagado diario de ECS staging en Windows (23:59 hora local).
# Costo: USD 0. Requiere que el PC este encendido a esa hora.
#
# Uso:
#   .\scripts\setup-windows-nightly-stop.ps1
#   .\scripts\setup-windows-nightly-stop.ps1 -Hour 23 -Minute 59
#
# Quitar:
#   .\scripts\remove-windows-nightly-stop.ps1

param(
  [string]$TaskName = "EasyComp-Staging-ECS-Stop",
  [int]$Hour = 23,
  [int]$Minute = 59
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$stopScript = Join-Path $root "scripts\aws-staging-stop.ps1"

if (-not (Test-Path $stopScript)) {
  throw "No existe $stopScript"
}

$at = "{0:D2}:{1:D2}" -f $Hour, $Minute
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$stopScript`""

$trigger = New-ScheduledTaskTrigger -Daily -At $at

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Apaga ECS staging (desired-count=0) todos los dias a las $at" `
  -Force | Out-Null

Write-Host "OK. Tarea programada '$TaskName' creada." -ForegroundColor Green
Write-Host "  Hora:    $at (hora local de Windows)"
Write-Host "  Script:  $stopScript"
Write-Host "  Costo:   USD 0"
Write-Host ""
Write-Host "Ver en: Programador de tareas > Biblioteca del Programador de tareas"
Write-Host "Probar: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Quitar: .\scripts\remove-windows-nightly-stop.ps1"
