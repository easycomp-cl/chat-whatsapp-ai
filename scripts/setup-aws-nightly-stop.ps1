# Crea apagado automatico diario de ECS staging (23:59 hora Chile).
# Costo estimado: ~USD 0/mes (Lambda + EventBridge Scheduler en free tier).
#
# Que apaga:  ECS Fargate (desired-count = 0) -> ahorra ~USD 20-25/mes si no usas de noche.
# Que NO apaga: ALB (~USD 16/mes), Secrets Manager, ECR, Supabase, Upstash.
#
# Uso:
#   .\scripts\setup-aws-nightly-stop.ps1
#   .\scripts\setup-aws-nightly-stop.ps1 -Hour 23 -Minute 59
#
# Para quitar:
#   .\scripts\remove-aws-nightly-stop.ps1

param(
  [string]$Region = "sa-east-1",
  [string]$AccountId = "024848463506",
  [string]$ClusterName = "easycomp-staging",
  [string]$ServiceName = "chat-whatsapp-ai-combined",
  [string]$Timezone = "America/Santiago",
  [int]$Hour = 23,
  [int]$Minute = 59,
  [string]$FunctionName = "easycomp-staging-ecs-nightly-stop",
  [string]$ScheduleName = "easycomp-staging-ecs-stop-2359",
  [string]$RoleName = "easycomp-staging-ecs-scheduler-lambda",
  [string]$SchedulerRoleName = "easycomp-staging-eventbridge-scheduler"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$lambdaDir = Join-Path $root "infra\ecs-nightly-stop"
$zipPath = Join-Path $env:TEMP "easycomp-ecs-nightly-stop.zip"

function Test-AwsOk {
  param([Parameter(Mandatory = $true)][string[]]$AwsArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  & aws @AwsArgs 2>&1 | Out-Null
  $ok = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prev
  return $ok
}

if ($Hour -lt 0 -or $Hour -gt 23 -or $Minute -lt 0 -or $Minute -gt 59) {
  throw "Hora invalida. Usa Hour 0-23 y Minute 0-59."
}

$cron = "cron($Minute $Hour * * ? *)"
$clusterArn = "arn:aws:ecs:${Region}:${AccountId}:cluster/${ClusterName}"
$functionArn = "arn:aws:lambda:${Region}:${AccountId}:function:${FunctionName}"
$lambdaRoleArn = "arn:aws:iam::${AccountId}:role/${RoleName}"
$schedulerRoleArn = "arn:aws:iam::${AccountId}:role/${SchedulerRoleName}"

Write-Host "Configurando apagado ECS diario a las $($Hour.ToString('00')):$($Minute.ToString('00')) ($Timezone)..." -ForegroundColor Cyan
Write-Host "Cluster: $ClusterName | Servicio: $ServiceName | Cron: $cron"
Write-Host ""

# --- IAM: rol Lambda ---
$trustPath = Join-Path $lambdaDir "trust-policy-lambda.json"
$roleExists = Test-AwsOk -AwsArgs @("iam", "get-role", "--role-name", $RoleName)

if (-not $roleExists) {
  Write-Host "Creando rol Lambda $RoleName..."
  aws iam create-role `
    --role-name $RoleName `
    --assume-role-policy-document "file://$trustPath" `
    --description "Lambda para apagar ECS staging cada noche" | Out-Null
  Start-Sleep -Seconds 8
}

$policyPath = Join-Path $lambdaDir "policy-ecs-update.json"
aws iam put-role-policy `
  --role-name $RoleName `
  --policy-name "ecs-nightly-stop" `
  --policy-document "file://$policyPath" | Out-Null

# --- Lambda ---
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $lambdaDir "lambda_function.py") -DestinationPath $zipPath -Force

$lambdaExists = Test-AwsOk -AwsArgs @("lambda", "get-function", "--function-name", $FunctionName, "--region", $Region)

$envVars = "Variables={ECS_CLUSTER=$ClusterName,ECS_SERVICE=$ServiceName}"

if ($lambdaExists) {
  Write-Host "Actualizando Lambda $FunctionName..."
  aws lambda update-function-code `
    --function-name $FunctionName `
    --zip-file "fileb://$zipPath" `
    --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Fallo al actualizar codigo Lambda" }
  aws lambda wait function-updated --function-name $FunctionName --region $Region
  aws lambda update-function-configuration `
    --function-name $FunctionName `
    --role $lambdaRoleArn `
    --runtime python3.12 `
    --handler lambda_function.handler `
    --timeout 30 `
    --environment $envVars `
    --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Fallo al actualizar configuracion Lambda" }
  aws lambda wait function-updated --function-name $FunctionName --region $Region
} else {
  Write-Host "Creando Lambda $FunctionName..."
  aws lambda create-function `
    --function-name $FunctionName `
    --runtime python3.12 `
    --role $lambdaRoleArn `
    --handler lambda_function.handler `
    --zip-file "fileb://$zipPath" `
    --timeout 30 `
    --environment $envVars `
    --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw @"
Fallo al crear Lambda. El usuario IAM necesita permisos lambda:* y scheduler:*.
Adjunta la politica: infra/ecs-nightly-stop/iam-user-policy-scheduler.json
Alternativa sin permisos extra: .\scripts\setup-windows-nightly-stop.ps1
"@
  }
  aws lambda wait function-active --function-name $FunctionName --region $Region
}

$prevEa = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
aws lambda add-permission `
  --function-name $FunctionName `
  --statement-id "AllowEventBridgeScheduler" `
  --action "lambda:InvokeFunction" `
  --principal scheduler.amazonaws.com `
  --source-arn "arn:aws:scheduler:${Region}:${AccountId}:schedule/default/*" `
  --region $Region 2>&1 | Out-Null
$ErrorActionPreference = $prevEa

# --- IAM: rol EventBridge Scheduler ---
$schedulerTrust = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Principal = @{ Service = "scheduler.amazonaws.com" }
      Action = "sts:AssumeRole"
    }
  )
} | ConvertTo-Json -Depth 5 -Compress

$schedulerTrustPath = Join-Path $env:TEMP "scheduler-trust.json"
[System.IO.File]::WriteAllText($schedulerTrustPath, $schedulerTrust, [System.Text.UTF8Encoding]::new($false))

$schedulerRoleExists = Test-AwsOk -AwsArgs @("iam", "get-role", "--role-name", $SchedulerRoleName)

if (-not $schedulerRoleExists) {
  Write-Host "Creando rol Scheduler $SchedulerRoleName..."
  aws iam create-role `
    --role-name $SchedulerRoleName `
    --assume-role-policy-document "file://$schedulerTrustPath" `
    --description "EventBridge Scheduler invoca Lambda de apagado ECS" | Out-Null
  Start-Sleep -Seconds 8
}

$schedulerPolicy = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Action = @("lambda:InvokeFunction")
      Resource = $functionArn
    }
  )
} | ConvertTo-Json -Depth 5 -Compress

$schedulerPolicyPath = Join-Path $env:TEMP "scheduler-policy.json"
[System.IO.File]::WriteAllText($schedulerPolicyPath, $schedulerPolicy, [System.Text.UTF8Encoding]::new($false))

aws iam put-role-policy `
  --role-name $SchedulerRoleName `
  --policy-name "invoke-ecs-stop-lambda" `
  --policy-document "file://$schedulerPolicyPath" | Out-Null

# --- EventBridge Scheduler ---
$targetJson = @{
  Arn     = $functionArn
  RoleArn = $schedulerRoleArn
  Input   = "{}"
} | ConvertTo-Json -Compress

$targetPath = Join-Path $env:TEMP "scheduler-target.json"
[System.IO.File]::WriteAllText($targetPath, $targetJson, [System.Text.UTF8Encoding]::new($false))

$scheduleExists = Test-AwsOk -AwsArgs @("scheduler", "get-schedule", "--name", $ScheduleName, "--region", $Region)

if ($scheduleExists) {
  Write-Host "Actualizando schedule $ScheduleName..."
  aws scheduler update-schedule `
    --name $ScheduleName `
    --schedule-expression $cron `
    --schedule-expression-timezone $Timezone `
    --flexible-time-window "Mode=OFF" `
    --target "file://$targetPath" `
    --state ENABLED `
    --region $Region | Out-Null
} else {
  Write-Host "Creando schedule $ScheduleName..."
  aws scheduler create-schedule `
    --name $ScheduleName `
    --schedule-expression $cron `
    --schedule-expression-timezone $Timezone `
    --flexible-time-window "Mode=OFF" `
    --target "file://$targetPath" `
    --state ENABLED `
    --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo al crear schedule EventBridge. Revisa permisos scheduler:* o usa setup-windows-nightly-stop.ps1"
  }
}

Remove-Item $zipPath, $schedulerTrustPath, $schedulerPolicyPath, $targetPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "OK. Apagado automatico configurado." -ForegroundColor Green
Write-Host ""
Write-Host "Resumen:" -ForegroundColor Cyan
Write-Host "  Hora:     $($Hour.ToString('00')):$($Minute.ToString('00')) ($Timezone)"
Write-Host "  Accion:   ECS $ServiceName -> desired-count 0"
Write-Host "  Costo:    ~USD 0/mes (30 invocaciones Lambda/mes)"
Write-Host "  Ahorro:   ~USD 0.03/hora Fargate apagado (512 CPU / 1 GB)"
Write-Host ""
Write-Host "Para encender manualmente: .\scripts\aws-staging-start.ps1"
Write-Host "Para probar ahora:        aws lambda invoke --function-name $FunctionName --region $Region out.json"
Write-Host "Para eliminar schedule:   .\scripts\remove-aws-nightly-stop.ps1"
