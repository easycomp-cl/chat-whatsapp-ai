# Vincula cuenta WhatsApp de Meta al negocio en staging (AWS).
# El token se guarda cifrado en Supabase. NO requiere redeploy ECS.
#
# Uso (token desde .env.production):
#   .\scripts\link-whatsapp-staging.ps1 `
#     -PhoneNumberId "123456789" `
#     -PhoneNumber "+56946867544"
#
# Uso explícito:
#   .\scripts\link-whatsapp-staging.ps1 `
#     -PhoneNumberId "123456789" `
#     -PhoneNumber "+56912345678" `
#     -AccessToken "EAAxxxxx"
#
# Si no tienes business_id, el script crea el negocio "EasyComp Piloto".
# TENANT_ID en .env.production se usa como BusinessId si está definido.

param(
  [Parameter(Mandatory = $true)]
  [string]$PhoneNumberId,
  [string]$PhoneNumber = "+56946867544",
  [string]$AccessToken = "",
  [string]$BusinessId = "",
  [string]$ApiBase = "https://api.conversai.easycomp.cl",
  [string]$EnvFile = ".env.production"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envPath = Join-Path $root $EnvFile

if (-not (Test-Path $envPath)) {
  throw "No existe $envPath"
}

$vars = @{}
Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $vars[$line.Substring(0, $eq).Trim()] = $line.Substring($eq + 1).Trim()
}

$apiKey = $vars["INTERNAL_API_KEY"]
if (-not $apiKey) { throw "Falta INTERNAL_API_KEY en $EnvFile" }

if (-not $AccessToken) {
  $AccessToken = $vars["META_SYSTEM_USER_ACCESS_TOKEN"]
  if (-not $AccessToken) {
    throw "Pasa -AccessToken o define META_SYSTEM_USER_ACCESS_TOKEN en $EnvFile"
  }
}

if (-not $BusinessId -and $vars["TENANT_ID"]) {
  $BusinessId = $vars["TENANT_ID"]
  Write-Host "Usando TENANT_ID del env: $BusinessId"
}

$headers = @{
  "X-API-Key"        = $apiKey
  "Content-Type"     = "application/json"
}

if (-not $BusinessId) {
  Write-Host "Creando negocio easycomp-piloto..."
  $created = Invoke-RestMethod -Method POST -Uri "$ApiBase/businesses" -Headers $headers -Body (@{
    name    = "EasyComp Piloto"
    slug    = "easycomp-piloto"
    botName = "Asistente"
    botTone = "profesional y cercano"
  } | ConvertTo-Json)
  $BusinessId = $created.id
  Write-Host "Business ID: $BusinessId"
}

Write-Host "Vinculando WhatsApp phone_number_id=$PhoneNumberId ..."
$result = Invoke-RestMethod -Method POST `
  -Uri "$ApiBase/businesses/$BusinessId/whatsapp-accounts" `
  -Headers $headers `
  -Body (@{
    phone_number_id = $PhoneNumberId
    phone_number    = $PhoneNumber
    access_token    = $AccessToken
  } | ConvertTo-Json)

Write-Host "OK. Canal vinculado:"
Write-Host "  tenantId:       $($result.tenantId)"
Write-Host "  phoneNumberId:  $($result.phoneNumberId)"
Write-Host "  phoneNumber:    $($result.phoneNumber)"
Write-Host ""
Write-Host "Siguiente: envia 'Hola' al numero de prueba de Meta desde tu WhatsApp."
