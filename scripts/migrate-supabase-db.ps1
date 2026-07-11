# Migra schema Prisma + SQL de la UI a Supabase staging.
# Uso:
#   $env:DATABASE_URL="postgresql://..."   # Session pooler recomendado (IPv4)
#   .\scripts\migrate-supabase-db.ps1
#
# Obtener URL en Supabase Dashboard -> Connect -> Session pooler (puerto 5432)
# o Direct connection si tu red soporta IPv6.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$UiMigrations = Join-Path (Split-Path -Parent $Root) "chat-whatsapp-ai-ui\supabase\migrations"

if (-not $env:DATABASE_URL) {
  Write-Error "Define DATABASE_URL antes de ejecutar (Session pooler de Supabase recomendado)."
}

if ($env:DATABASE_URL -notmatch "sslmode=") {
  $sep = if ($env:DATABASE_URL -match "\?") { "&" } else { "?" }
  $env:DATABASE_URL = "$($env:DATABASE_URL)${sep}sslmode=require"
}

Set-Location $Root

Write-Host "==> prisma generate"
npx prisma generate

Write-Host "==> prisma migrate deploy (backend)"
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path $UiMigrations)) {
  Write-Warning "No se encontro $UiMigrations - salta migraciones UI."
  exit 0
}

$uiFiles = Get-ChildItem $UiMigrations -Filter "*.sql" | Sort-Object Name
foreach ($file in $uiFiles) {
  Write-Host "==> UI migration: $($file.Name)"
  npx prisma db execute --file $file.FullName --url $env:DATABASE_URL
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Migracion completada. Validar tablas en Supabase SQL Editor."
