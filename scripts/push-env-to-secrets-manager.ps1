# Sube .env.production a AWS Secrets Manager.
# Uso (desde la raíz del repo):
#   .\scripts\push-env-to-secrets-manager.ps1
#   .\scripts\push-env-to-secrets-manager.ps1 -SecretName chat-whatsapp-ai/staging -Region sa-east-1

param(
  [string]$EnvFile = ".env.production",
  [string]$SecretName = "chat-whatsapp-ai/staging",
  [string]$Region = "sa-east-1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envPath = Join-Path $root $EnvFile

if (-not (Test-Path $envPath)) {
  throw "No existe $envPath. Copia .env.production.example y completa los valores."
}

$secrets = @{}
Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $key = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $secrets[$key] = $value
}

if ($secrets.Count -eq 0) {
  throw "No se leyeron variables desde $envPath"
}

$jsonPath = Join-Path $env:TEMP "chat-whatsapp-ai-secrets.json"
$json = $secrets | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($jsonPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host "Variables leidas: $($secrets.Count)"
Write-Host "Secreto destino: $SecretName ($Region)"

$describeOk = $true
try {
  aws secretsmanager describe-secret --secret-id $SecretName --region $Region | Out-Null
  if ($LASTEXITCODE -ne 0) { $describeOk = $false }
} catch {
  $describeOk = $false
}

if ($describeOk) {
  Write-Host "Actualizando secreto existente..."
  aws secretsmanager put-secret-value `
    --secret-id $SecretName `
    --secret-string "file://$jsonPath" `
    --region $Region
} else {
  Write-Host "Creando secreto nuevo..."
  aws secretsmanager create-secret `
    --name $SecretName `
    --secret-string "file://$jsonPath" `
    --region $Region
}

Remove-Item $jsonPath -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
  throw "Error al subir secretos a AWS"
}

Write-Host "OK. En ECS mapea cada key del secreto como variable de entorno del contenedor."
