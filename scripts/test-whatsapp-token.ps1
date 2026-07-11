# Valida un token de Meta contra un phone_number_id antes de vincular.
# Uso:
#   .\scripts\test-whatsapp-token.ps1 `
#     -PhoneNumberId "1068250019704829" `
#     -AccessToken "EAAxxxxx"

param(
  [Parameter(Mandatory = $true)]
  [string]$PhoneNumberId,
  [Parameter(Mandatory = $true)]
  [string]$AccessToken,
  [string]$GraphVersion = "v20.0"
)

$ErrorActionPreference = "Stop"
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
