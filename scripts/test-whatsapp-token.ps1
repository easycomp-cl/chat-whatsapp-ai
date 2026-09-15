# Valida un token de Meta contra un phone_number_id antes de vincular.
# Uso:
#   .\scripts\test-whatsapp-token.ps1 -PhoneNumberId "1068250019704829"
#   (lee META_SYSTEM_USER_ACCESS_TOKEN de .env.production)
#
#   .\scripts\test-whatsapp-token.ps1 `
#     -PhoneNumberId "1068250019704829" `
#     -AccessToken "EAAxxxxx"

param(
  [Parameter(Mandatory = $true)]
  [string]$PhoneNumberId,
  [string]$AccessToken = "",
  [string]$GraphVersion = "v20.0",
  [string]$EnvFile = ".env.production"
)

$ErrorActionPreference = "Stop"

if (-not $AccessToken) {
  $root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
  $envPath = Join-Path $root $EnvFile
  if (-not (Test-Path $envPath)) {
    throw "Pasa -AccessToken o define META_SYSTEM_USER_ACCESS_TOKEN en $EnvFile"
  }
  $vars = @{}
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $vars[$line.Substring(0, $eq).Trim()] = $line.Substring($eq + 1).Trim()
  }
  $AccessToken = $vars["META_SYSTEM_USER_ACCESS_TOKEN"]
  if (-not $AccessToken) {
    throw "Falta META_SYSTEM_USER_ACCESS_TOKEN en $EnvFile"
  }
  if ($vars["WHATSAPP_GRAPH_VERSION"]) {
    $GraphVersion = $vars["WHATSAPP_GRAPH_VERSION"]
  }
}

$token = $AccessToken.Trim()

Write-Host "Probando token contra phone_number_id=$PhoneNumberId ..." -ForegroundColor Cyan

$headers = @{ Authorization = "Bearer $token" }
$info = Invoke-RestMethod -Uri "https://graph.facebook.com/$GraphVersion/$PhoneNumberId" -Headers $headers

Write-Host "OK. Numero en Meta:" -ForegroundColor Green
Write-Host "  display_phone_number: $($info.display_phone_number)"
Write-Host "  verified_name:        $($info.verified_name)"
Write-Host ""
Write-Host "Si esto falla con 401/190, el token no sirve para este numero. Genera uno nuevo en"
Write-Host "Meta Developers > WhatsApp > API Setup (con ese numero seleccionado)."
